import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { headers } from "next/headers"
import type { SubscriptionPlan } from "@/lib/subscription-utils"
import { unassignClientSeeds } from "@/lib/seed-utils"
import { getPlanLimits, formatPlanName } from "@/lib/subscription-utils"
import { sendSubscriptionCancellationWarning } from "@/lib/mailgun"

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

async function enforceFollowLimits(clientId: string, newPlan: string, prismaClient: typeof prisma): Promise<number> {
  const planLimits = getPlanLimits(newPlan as any)
  const newFollowLimit = planLimits.ciFollowLimit

  if (newFollowLimit === null) {
    return 0
  }

  const currentFollows = await prismaClient.ciEntitySubscription.findMany({
    where: { clientId },
    orderBy: { createdAt: "asc" },
    include: {
      entity: {
        select: {
          name: true,
        },
      },
    },
  })

  const followsToRemove = currentFollows.length - newFollowLimit
  if (followsToRemove <= 0) {
    return 0
  }

  const entitiesToUnfollow = currentFollows.slice(newFollowLimit)
  const entityIdsToUnfollow = entitiesToUnfollow.map((f) => f.id)

  await prismaClient.ciEntitySubscription.deleteMany({
    where: {
      id: { in: entityIdsToUnfollow },
    },
  })

  console.log(`[Stripe Webhook] Unfollowed ${followsToRemove} entities for client ${clientId}`)
  return followsToRemove
}

function getFeaturesLost(oldPlan: string, newPlan: string): string[] {
  const oldLimits = getPlanLimits(oldPlan as any)
  const newLimits = getPlanLimits(newPlan as any)
  const features: string[] = []

  if (oldLimits.ciHistoryDays === null && newLimits.ciHistoryDays !== null) {
    features.push(`Unlimited campaign history (limited to ${newLimits.ciHistoryDays} days)`)
  }

  if (oldLimits.ciFollowLimit === null && newLimits.ciFollowLimit !== null) {
    features.push(`Unlimited entity follows (limited to ${newLimits.ciFollowLimit})`)
  } else if (
    oldLimits.ciFollowLimit !== null &&
    newLimits.ciFollowLimit !== null &&
    oldLimits.ciFollowLimit > newLimits.ciFollowLimit
  ) {
    features.push(`Follow up to ${oldLimits.ciFollowLimit} entities (reduced to ${newLimits.ciFollowLimit})`)
  }

  if (oldLimits.hasPersonalEmail && !newLimits.hasPersonalEmail) {
    features.push("Personal email tracking")
  }

  if (oldLimits.hasInboxTools && !newLimits.hasInboxTools) {
    features.push("Inbox Tools access")
  }

  if (oldLimits.seedTestsPerMonth !== null && oldLimits.seedTestsPerMonth > 0) {
    if (newLimits.seedTestsPerMonth === null || newLimits.seedTestsPerMonth === 0) {
      features.push(`${oldLimits.seedTestsPerMonth} seed tests per month`)
    }
  }

  if (oldLimits.canAddOwnSeeds && !newLimits.canAddOwnSeeds) {
    features.push("Add your own seed emails")
  }

  return features
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = headers().get("stripe-signature")

  if (!signature || !webhookSecret) {
    console.error("[Stripe Webhook] Missing signature or webhook secret")
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  let event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  console.log("[Stripe Webhook] Event received:", event.type)

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object
        console.log("[Stripe Webhook] Checkout completed:", session.id)

        const clientId = session.metadata?.clientId
        const plan = session.metadata?.plan as SubscriptionPlan
        const hasCompetitiveInsights = session.metadata?.hasCompetitiveInsights === "true"
        const subscriptionType = session.metadata?.subscriptionType // "plan", "ci", or "both"

        if (clientId && session.subscription) {
          const existingClient = await prisma.client.findUnique({
            where: { id: clientId },
            select: { stripeSubscriptionId: true, stripeCiSubscriptionId: true },
          })

          const subscription = await stripe.subscriptions.retrieve(session.subscription as string, {
            expand: ["items.data.price.product"],
          })

          const updateData: any = {
            stripeCustomerId: session.customer as string,
            subscriptionStatus: "active",
          }

          const subscriptionStartDate = new Date(subscription.current_period_start * 1000)
          const subscriptionRenewDate = new Date(subscription.current_period_end * 1000)

          updateData.subscriptionStartDate = subscriptionStartDate
          updateData.subscriptionRenewDate = subscriptionRenewDate
          updateData.lastUsageReset = subscriptionStartDate

          console.log(
            "[Stripe Webhook] Subscription items:",
            subscription.items.data.map((item) => ({
              id: item.id,
              product: typeof item.price.product === "object" ? item.price.product.name : item.price.product,
            })),
          )

          let hasCiItem = false
          let hasPlanItem = false
          let additionalUserSeats = 0

          for (const item of subscription.items.data) {
            const productName = typeof item.price.product === "object" ? item.price.product.name : null

            if (
              productName === "Basic" ||
              productName === "Professional" ||
              productName === "Advanced" ||
              productName === "Enterprise" ||
              productName === "Starter"
            ) {
              hasPlanItem = true
              hasCiItem = true
              updateData.stripeSubscriptionItemId = item.id
              updateData.stripeCiSubscriptionItemId = item.id
              updateData.hasCompetitiveInsights = true

              const planMap: Record<string, SubscriptionPlan> = {
                Starter: "free",
                Basic: "paid",
                Professional: "all",
                Advanced: "basic_inboxing",
                Enterprise: "enterprise",
              }
              updateData.subscriptionPlan = planMap[productName] || plan

              const planLimits = getPlanLimits(updateData.subscriptionPlan)
              updateData.emailVolumeLimit =
                planLimits.emailVolumeLimit === Number.POSITIVE_INFINITY ? 999999999 : planLimits.emailVolumeLimit
              console.log(
                "[Stripe Webhook] Found unified CI+Plan item:",
                item.id,
                "Plan:",
                updateData.subscriptionPlan,
                "Limit:",
                updateData.emailVolumeLimit,
              )
            } else if (productName?.includes("Competitive Insights")) {
              hasCiItem = true
              updateData.stripeCiSubscriptionItemId = item.id
              updateData.hasCompetitiveInsights = true
              console.log("[Stripe Webhook] Found legacy CI item:", item.id)
            } else if (productName?.includes("Plan")) {
              hasPlanItem = true
              updateData.stripeSubscriptionItemId = item.id
              updateData.subscriptionPlan = plan
              const planLimits = getPlanLimits(plan)
              updateData.emailVolumeLimit =
                planLimits.emailVolumeLimit === Number.POSITIVE_INFINITY ? 999999999 : planLimits.emailVolumeLimit
              console.log(
                "[Stripe Webhook] Found legacy plan item:",
                item.id,
                "with limit:",
                updateData.emailVolumeLimit,
              )
            } else if (productName?.includes("Additional User Seats")) {
              additionalUserSeats = item.quantity || 0
              updateData.stripeUserSeatPriceId = item.price.id
              console.log("[Stripe Webhook] Found additional user seats:", additionalUserSeats)
            }
          }

          if (additionalUserSeats > 0) {
            updateData.additionalUserSeats = additionalUserSeats
          }

          if (hasCiItem && hasPlanItem) {
            updateData.stripeSubscriptionId = subscription.id
            updateData.stripeCiSubscriptionId = null
            console.log("[Stripe Webhook] Both items in same subscription:", subscription.id)
          } else if (hasCiItem && !hasPlanItem) {
            if (existingClient?.stripeSubscriptionId) {
              updateData.stripeCiSubscriptionId = subscription.id
              console.log("[Stripe Webhook] Separate CI subscription:", subscription.id)
            } else {
              updateData.stripeSubscriptionId = subscription.id
              console.log("[Stripe Webhook] CI-only subscription (no plan):", subscription.id)
            }
          } else if (hasPlanItem && !hasCiItem) {
            updateData.stripeSubscriptionId = subscription.id
            console.log("[Stripe Webhook] Plan-only subscription:", subscription.id)
          }

          await prisma.client.update({
            where: { id: clientId },
            data: updateData,
          })
          console.log("[Stripe Webhook] Updated client subscription:", clientId, updateData)
        }
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object
        console.log("[Stripe Webhook] Subscription updated:", subscription.id)

        const client = await prisma.client.findFirst({
          where: {
            OR: [{ stripeSubscriptionId: subscription.id }, { stripeCiSubscriptionId: subscription.id }],
          },
        })

        if (client) {
          console.log("[Stripe Webhook] Found client for subscription update:", client.id)
          console.log("[Stripe Webhook] Cancel at period end:", subscription.cancel_at_period_end)

          if (client.cancelAtPeriodEnd && client.scheduledDowngradePlan) {
            console.log("[Stripe Webhook] Conflict detected: both cancel and downgrade scheduled - clearing downgrade")
            await prisma.client.update({
              where: { id: client.id },
              data: {
                scheduledDowngradePlan: null,
              },
            })
          }

          if (subscription.cancel_at_period_end && subscription.cancel_at) {
            const users = await prisma.user.findMany({
              where: {
                clientId: client.id,
                role: "owner",
              },
            })

            if (users.length > 0) {
              const expiryDate = new Date(subscription.cancel_at * 1000)
              const currentPlanName = formatPlanName(client.subscriptionPlan)

              const follows = await prisma.ciEntitySubscription.findMany({
                where: { clientId: client.id },
                include: { entity: { select: { name: true } } },
                orderBy: { createdAt: "asc" },
              })

              const followedEntityNames = follows.map((f) => f.entity.name)
              const featuresLost = getFeaturesLost(client.subscriptionPlan, "free")

              for (const user of users) {
                await sendSubscriptionCancellationWarning(
                  user.email,
                  client.slug,
                  currentPlanName,
                  expiryDate,
                  followedEntityNames,
                  featuresLost,
                )
              }
            }
          }

          const fullSubscription = await stripe.subscriptions.retrieve(subscription.id, {
            expand: ["items.data.price.product"],
          })

          const updateData: any = {
            cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
          }

          if (subscription.status === "active") {
            updateData.subscriptionStatus = "active"
          } else if (subscription.status === "past_due") {
            updateData.subscriptionStatus = "past_due"
          }

          let hasPlanItem = false
          let hasCiItem = false
          let additionalUserSeats = 0

          for (const item of fullSubscription.items.data) {
            const productName = typeof item.price.product === "object" ? item.price.product.name : null

            if (
              productName === "Basic" ||
              productName === "Professional" ||
              productName === "Advanced" ||
              productName === "Enterprise" ||
              productName === "Starter"
            ) {
              hasPlanItem = true
              hasCiItem = true
              updateData.stripeSubscriptionItemId = item.id
              updateData.stripeCiSubscriptionItemId = item.id
              updateData.hasCompetitiveInsights = true

              const planMap: Record<string, SubscriptionPlan> = {
                Starter: "free",
                Basic: "paid",
                Professional: "all",
                Advanced: "basic_inboxing",
                Enterprise: "enterprise",
              }
              const newPlan = planMap[productName]
              if (newPlan) {
                updateData.subscriptionPlan = newPlan
                const planLimits = getPlanLimits(newPlan)
                updateData.emailVolumeLimit =
                  planLimits.emailVolumeLimit === Number.POSITIVE_INFINITY ? 999999999 : planLimits.emailVolumeLimit
                console.log("[Stripe Webhook] Updated plan to:", newPlan, "with limit:", updateData.emailVolumeLimit)
              }
            } else if (productName?.includes("Competitive Insights")) {
              updateData.stripeCiSubscriptionItemId = item.id
              updateData.hasCompetitiveInsights = true
              hasCiItem = true
            } else if (productName?.includes("Plan")) {
              updateData.stripeSubscriptionItemId = item.id
              hasPlanItem = true
            } else if (productName?.includes("Additional User Seats")) {
              additionalUserSeats = item.quantity || 0
              updateData.stripeUserSeatPriceId = item.price.id
              console.log("[Stripe Webhook] Updated additional user seats:", additionalUserSeats)
            }
          }

          updateData.additionalUserSeats = additionalUserSeats

          const subscriptionRenewDate = new Date(fullSubscription.current_period_end * 1000)
          if (client.subscriptionRenewDate?.getTime() !== subscriptionRenewDate.getTime()) {
            updateData.subscriptionRenewDate = subscriptionRenewDate
          }

          if (client.scheduledDowngradePlan && client.subscriptionRenewDate) {
            const now = new Date()
            const renewDate = new Date(client.subscriptionRenewDate)
            const timeDiff = Math.abs(now.getTime() - renewDate.getTime())
            const hoursDiff = timeDiff / (1000 * 60 * 60)

            if (hoursDiff < 24) {
              console.log(
                `[Stripe Webhook] Applying scheduled downgrade from ${client.subscriptionPlan} to ${client.scheduledDowngradePlan}`,
              )

              const newPlan = client.scheduledDowngradePlan as SubscriptionPlan
              const newLimits = getPlanLimits(newPlan)

              const follows = await prisma.ciEntitySubscription.findMany({
                where: { clientId: client.id },
                orderBy: { createdAt: "asc" },
              })

              if (follows.length > (newLimits.ciFollowLimit || 0)) {
                const toUnfollow = follows.slice(newLimits.ciFollowLimit || 0)
                await prisma.ciEntitySubscription.deleteMany({
                  where: {
                    id: { in: toUnfollow.map((f) => f.id) },
                  },
                })
                console.log(`[Stripe Webhook] Unfollowed ${toUnfollow.length} entities due to plan downgrade`)
              }

              updateData.subscriptionPlan = newPlan
              updateData.scheduledDowngradePlan = null
              updateData.hasCompetitiveInsights = newLimits.hasCompetitiveInsights
              updateData.emailVolumeLimit =
                newLimits.emailVolumeLimit === Number.POSITIVE_INFINITY ? 999999999 : newLimits.emailVolumeLimit
            }
          }

          if (client.stripeSubscriptionId === subscription.id) {
            if (!hasCiItem && client.stripeCiSubscriptionItemId && !client.stripeCiSubscriptionId) {
              updateData.stripeCiSubscriptionItemId = null
              updateData.hasCompetitiveInsights = false
            }
            if (!hasPlanItem && client.stripeSubscriptionItemId) {
              updateData.stripeSubscriptionItemId = null
            }
          } else if (client.stripeCiSubscriptionId === subscription.id) {
            if (!hasCiItem && client.stripeCiSubscriptionItemId) {
              updateData.stripeCiSubscriptionItemId = null
              updateData.hasCompetitiveInsights = false
            }
          }

          if (Object.keys(updateData).length > 0) {
            await prisma.client.update({
              where: { id: client.id },
              data: updateData,
            })
            console.log("[Stripe Webhook] Updated subscription:", updateData)
          }
        }
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object
        console.log("[Stripe Webhook] Subscription canceled:", subscription.id)

        const client = await prisma.client.findFirst({
          where: {
            OR: [{ stripeSubscriptionId: subscription.id }, { stripeCiSubscriptionId: subscription.id }],
          },
        })

        if (client) {
          const unfollowedCount = await enforceFollowLimits(client.id, "free", prisma)
          console.log(`[Stripe Webhook] Auto-unfollowed ${unfollowedCount} entities`)

          const updateData: any = {
            cancelAtPeriodEnd: false,
          }

          if (client.stripeSubscriptionId === subscription.id) {
            updateData.subscriptionStatus = "cancelled"
            updateData.subscriptionPlan = "free"
            updateData.stripeSubscriptionId = null
            updateData.stripeSubscriptionItemId = null
            updateData.emailVolumeLimit = 0

            if (!client.stripeCiSubscriptionId) {
              updateData.hasCompetitiveInsights = false
              updateData.stripeCiSubscriptionItemId = null
            }

            await unassignClientSeeds(client.id)

            console.log("[Stripe Webhook] Set subscription status to cancelled and plan to free for:", client.id)
          } else if (client.stripeCiSubscriptionId === subscription.id) {
            updateData.hasCompetitiveInsights = false
            updateData.stripeCiSubscriptionId = null
            updateData.stripeCiSubscriptionItemId = null
            console.log("[Stripe Webhook] Cleared CI subscription data for:", client.id)
          }

          await prisma.client.update({
            where: { id: client.id },
            data: updateData,
          })
        }

        break
      }

      default:
        console.log("[Stripe Webhook] Unhandled event type:", event.type)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("[Stripe Webhook] Error processing webhook:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}
