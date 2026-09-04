"use server"

import { stripe } from "@/lib/stripe"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  PLAN_PRICES,
  CI_ADDON_PRICE,
  ADDITIONAL_USER_SEAT_PRICE,
  calculateAdditionalSeatsNeeded,
  type SubscriptionPlan,
} from "@/lib/subscription-utils"
import type Stripe from "stripe"

export async function createCheckoutSession(data: {
  plan: SubscriptionPlan
  hasCompetitiveInsights: boolean
  clientSlug: string
}) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      throw new Error("Unauthorized")
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { client: true },
    })

    if (!user?.client) {
      throw new Error("Client not found")
    }

    const client = user.client

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []

    let subscriptionType: "plan" | "ci" | "both" = "plan"

    const isNewPlan =
      (data.plan !== client.subscriptionPlan || !client.stripeSubscriptionId) && data.plan !== "enterprise"
    if (isNewPlan) {
      const planPrice = PLAN_PRICES[data.plan]
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: `${data.plan.charAt(0).toUpperCase() + data.plan.slice(1)} Plan`,
            description: `Monthly subscription to the ${data.plan} plan`,
          },
          unit_amount: planPrice * 100,
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      })

      if (data.plan === "all") {
        // Count active users for this client
        const activeUserCount = await prisma.user.count({
          where: {
            clientId: client.id,
          },
        })

        const additionalSeatsNeeded = calculateAdditionalSeatsNeeded(data.plan, activeUserCount)

        console.log("[v0] User seat calculation:", {
          currentUsers: activeUserCount,
          additionalSeatsNeeded,
          costPerSeat: ADDITIONAL_USER_SEAT_PRICE,
          totalExtraCost: additionalSeatsNeeded * ADDITIONAL_USER_SEAT_PRICE,
        })

        if (additionalSeatsNeeded > 0) {
          lineItems.push({
            price_data: {
              currency: "usd",
              product_data: {
                name: "Additional User Seats",
                description: `${additionalSeatsNeeded} additional user seat${additionalSeatsNeeded > 1 ? "s" : ""} at $${ADDITIONAL_USER_SEAT_PRICE}/month each`,
              },
              unit_amount: ADDITIONAL_USER_SEAT_PRICE * 100,
              recurring: {
                interval: "month",
              },
            },
            quantity: additionalSeatsNeeded,
          })
        }
      }
    }

    const isNewCI = data.hasCompetitiveInsights && !client.hasCompetitiveInsights && data.plan !== "enterprise"
    if (isNewCI) {
      lineItems.push({
        price_data: {
          currency: "usd",
          product_data: {
            name: "Competitive Insights Add-on",
            description: "Access to comprehensive political email database",
          },
          unit_amount: CI_ADDON_PRICE * 100,
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      })
      subscriptionType = isNewPlan ? "both" : "ci"
    }

    if (lineItems.length === 0) {
      throw new Error("No new items to add to subscription")
    }

    if (data.plan === "enterprise") {
      return {
        url: `mailto:support@rip-tool.com?subject=Enterprise Plan Inquiry&body=I'm interested in the Enterprise plan for ${client.name}`,
      }
    }

    const isDevelopment = process.env.NODE_ENV === "development"
    const baseUrl = isDevelopment ? "http://localhost:3000" : "https://app.rip-tool.com"
    const successUrl = `${baseUrl}/${data.clientSlug}?success=true`
    const cancelUrl = `${baseUrl}/${data.clientSlug}/billing?canceled=true`

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      client_reference_id: client.id,
      metadata: {
        clientId: client.id,
        userId: user.id,
        plan: data.plan,
        hasCompetitiveInsights: data.hasCompetitiveInsights.toString(),
        subscriptionType,
      },
    })

    return { url: checkoutSession.url }
  } catch (error) {
    console.error("[v0] Error creating checkout session:", error)
    throw error
  }
}

// Starts a Stripe Checkout session for a code-redeemed free trial. The subscription is created
// immediately in "trialing" status with card details on file — nothing is charged until the
// trial ends. If the trial isn't cancelled first, Stripe auto-charges the Basic ($50/mo) plan
// price on trialLengthDays and the webhook (checkout.session.completed +
// customer.subscription.updated) handles granting Enterprise-level access during the trial and
// then downgrading feature access to Basic at conversion.
export async function createTrialCheckoutSession(clientId: string) {
  const session = await getServerSession()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  const requestingUser = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!requestingUser || requestingUser.clientId !== clientId) {
    throw new Error("Unauthorized")
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: { users: { where: { role: "owner" }, take: 1 } },
  })

  if (!client) {
    throw new Error("Client not found")
  }

  if (!client.pendingTrialCodeId || !client.pendingTrialLengthDays) {
    throw new Error("No pending trial to start checkout for")
  }

  const owner = client.users[0]
  if (!owner) {
    throw new Error("Client has no owner user")
  }

  const basicPrice = PLAN_PRICES.paid // $50/mo — the plan the trial converts into

  const isDevelopment = process.env.NODE_ENV === "development"
  const baseUrl = isDevelopment ? "http://localhost:3000" : "https://app.rip-tool.com"
  const successUrl = `${baseUrl}/${client.slug}?trialStarted=true`
  // Cancelling checkout leaves the client on free with pendingTrialCodeId still set, so the
  // billing page can offer to resume checkout with the same redeemed code instead of losing it.
  const cancelUrl = `${baseUrl}/${client.slug}/account/billing?trialCheckoutCanceled=true`

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    // Card only (not "any eligible payment method"): the trial requires a payment method that
    // can be auto-charged off-session when the trial ends, which not all dynamic payment
    // methods support.
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: "Basic",
            description: `Basic Plan — starts after your ${client.pendingTrialLengthDays}-day free trial`,
          },
          unit_amount: basicPrice * 100,
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      },
    ],
    subscription_data: {
      trial_period_days: client.pendingTrialLengthDays,
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
    },
    payment_method_collection: "always",
    success_url: successUrl,
    cancel_url: cancelUrl,
    customer_email: owner.email,
    client_reference_id: client.id,
    metadata: {
      clientId: client.id,
      userId: owner.id,
      trialCodeId: client.pendingTrialCodeId,
      trialLengthDays: client.pendingTrialLengthDays.toString(),
      checkoutPurpose: "trial",
    },
  })

  return { url: checkoutSession.url }
}

export async function cancelSubscription(
  clientId: string,
  subscriptionType: "plan" | "ci" = "plan",
  feedback?: { reason: string; comment?: string },
) {
  const session = await getServerSession()
  if (!session?.user?.id) {
  throw new Error("Unauthorized")
  }
  
  const user = await prisma.user.findUnique({
  where: { id: session.user.id },
  include: { client: true },
  })
  
  if (!user || (user.role !== "owner" && user.role !== "admin")) {
  throw new Error("Only owners and admins can cancel subscriptions")
  }
  
  const client = await prisma.client.findUnique({
  where: { id: clientId },
  })
  
  if (!client) {
  throw new Error("Client not found")
  }

  // Record why the client is cancelling before touching Stripe, so we still capture the
  // feedback even if the Stripe call below fails for some reason.
  if (feedback?.reason) {
    await prisma.subscriptionCancellationFeedback.create({
      data: {
        clientId: client.id,
        clientName: client.name,
        userId: user.id,
        userEmail: user.email,
        subscriptionType,
        plan: subscriptionType === "ci" ? "ci" : client.subscriptionPlan,
        reason: feedback.reason,
        comment: feedback.comment?.trim() || null,
      },
    })
  }

  console.log("[v0] Cancel request:", {
    subscriptionType,
    stripeSubscriptionId: client.stripeSubscriptionId,
    stripeCiSubscriptionId: client.stripeCiSubscriptionId,
    stripeSubscriptionItemId: client.stripeSubscriptionItemId,
    stripeCiSubscriptionItemId: client.stripeCiSubscriptionItemId,
  })

  const targetSubscriptionId =
    subscriptionType === "ci"
      ? client.stripeCiSubscriptionId || client.stripeSubscriptionId // CI might be in separate sub or main sub
      : client.stripeSubscriptionId

  const subscriptionItemId =
    subscriptionType === "ci" ? client.stripeCiSubscriptionItemId : client.stripeSubscriptionItemId

  if (!subscriptionItemId || !targetSubscriptionId) {
    throw new Error(`No active ${subscriptionType} subscription found`)
  }

  const subscription = await stripe.subscriptions.retrieve(targetSubscriptionId, {
    expand: ["items.data.price.product"],
  })

  console.log("[v0] Subscription items count:", subscription.items.data.length)
  console.log(
    "[v0] Subscription items:",
    subscription.items.data.map((item) => ({
      id: item.id,
      product: typeof item.price.product === "object" ? item.price.product.name : item.price.product,
    })),
  )

  const itemExistsInSubscription = subscription.items.data.some((item) => item.id === subscriptionItemId)

  if (!itemExistsInSubscription) {
    throw new Error(`Subscription item ${subscriptionItemId} not found in subscription ${targetSubscriptionId}`)
  }

  const isSeparateSubscription =
    subscriptionType === "ci"
      ? client.stripeCiSubscriptionId !== null && client.stripeCiSubscriptionId !== client.stripeSubscriptionId
      : false

  console.log("[v0] Is separate subscription?", isSeparateSubscription)
  console.log("[v0] Items in subscription:", subscription.items.data.length)

  if (isSeparateSubscription || subscription.items.data.length === 1) {
    console.log("[v0] Scheduling cancellation at period end")
    await stripe.subscriptions.update(targetSubscriptionId, {
      cancel_at_period_end: true,
    })

    await prisma.client.update({
      where: { id: clientId },
      data: {
        cancelAtPeriodEnd: true,
        scheduledDowngradePlan: null,
      },
    })
  } else {
    console.log("[v0] Removing subscription item:", subscriptionItemId)
    await stripe.subscriptionItems.del(subscriptionItemId)

    console.log("[v0] Successfully removed item, subscription remains active")
  }

  return { success: true }
}
