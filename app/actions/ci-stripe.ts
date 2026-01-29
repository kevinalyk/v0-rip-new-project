"use server"

import { stripe } from "@/lib/stripe"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PLAN_PRICES, type SubscriptionPlan } from "@/lib/subscription-utils"

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  free: "Starter",
  paid: "Basic",
  all: "Professional",
  basic_inboxing: "Advanced",
  enterprise: "Enterprise",
}

const PLAN_TIER_ORDER: Record<string, number> = {
  free: 0,
  paid: 1,
  all: 2,
  basic_inboxing: 3,
  enterprise: 4,
}

export async function createCICheckoutSession(data: {
  plan: SubscriptionPlan
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

    if (data.plan === "free" && client.stripeSubscriptionId && client.subscriptionStatus === "active") {
      console.log("[CI Stripe] Processing cancellation - cancel at period end")

      await stripe.subscriptions.update(client.stripeSubscriptionId, {
        cancel_at_period_end: true,
        metadata: {
          scheduledCancellation: "true",
          downgradeTo: "free",
        },
      })

      const isDevelopment = process.env.NODE_ENV === "development"
      const baseUrl = isDevelopment ? "http://localhost:3000" : "https://app.rip-tool.com"
      return {
        url: `${baseUrl}/${data.clientSlug}/ci/campaigns?cancellation=scheduled`,
      }
    }

    if (data.plan === "free") {
      throw new Error("Cannot create checkout for free plan")
    }

    if (data.plan === "enterprise") {
      return {
        url: `mailto:support@rip-tool.com?subject=Enterprise Plan Inquiry&body=I'm interested in the Enterprise plan for ${client.name}`,
      }
    }

    if (client.stripeSubscriptionId && client.subscriptionStatus === "active") {
      // Client has an active subscription - handle upgrade or downgrade
      const currentPlan = client.subscriptionPlan
      const currentPrice = PLAN_PRICES[currentPlan]
      const newPrice = PLAN_PRICES[data.plan]

      const currentPlanTier = PLAN_TIER_ORDER[currentPlan]
      const targetPlanTier = PLAN_TIER_ORDER[data.plan]
      const isDowngrade = targetPlanTier < currentPlanTier

      console.log("[CI Stripe] Plan change detected:", {
        currentPlan,
        currentPrice,
        newPlan: data.plan,
        newPrice,
        isDowngrade,
      })

      // Get the current subscription from Stripe
      const subscription = await stripe.subscriptions.retrieve(client.stripeSubscriptionId, {
        expand: ["items.data.price.product"],
      })

      // Find the subscription item (should only be one for CI plans)
      const subscriptionItem = subscription.items.data[0]
      if (!subscriptionItem) {
        throw new Error("No subscription item found")
      }

      const newPlanName = PLAN_DISPLAY_NAMES[data.plan] || data.plan

      if (isDowngrade) {
        console.log("[CI Stripe] Processing downgrade - scheduled for end of period")

        // Schedule downgrade in database instead of updating Stripe
        await prisma.client.update({
          where: { id: client.id },
          data: {
            scheduledDowngradePlan: data.plan,
            cancelAtPeriodEnd: false, // Clear cancellation if downgrading
          },
        })

        const isDevelopment = process.env.NODE_ENV === "development"
        const baseUrl = isDevelopment ? "http://localhost:3000" : "https://app.rip-tool.com"
        return {
          url: `${baseUrl}/${data.clientSlug}/account/billing?downgrade=scheduled`,
        }
      }

      // For upgrades, proceed with immediate proration
      if (newPrice > currentPrice) {
        // UPGRADE: Immediate change with proration
        console.log("[CI Stripe] Processing upgrade - immediate with proration")

        const product = await stripe.products.create({
          name: newPlanName,
          description: `Monthly subscription to ${newPlanName} plan`,
        })

        const price = await stripe.prices.create({
          product: product.id,
          currency: "usd",
          unit_amount: newPrice * 100,
          recurring: {
            interval: "month",
          },
        })

        await stripe.subscriptions.update(subscription.id, {
          items: [
            {
              id: subscriptionItem.id,
              price: price.id,
            },
          ],
          proration_behavior: "always_invoice",
          metadata: {
            ...subscription.metadata,
            plan: data.plan,
          },
        })

        await prisma.client.update({
          where: { id: client.id },
          data: {
            subscriptionPlan: data.plan,
            scheduledDowngradePlan: null,
            cancelAtPeriodEnd: false,
          },
        })

        const isDevelopment = process.env.NODE_ENV === "development"
        const baseUrl = isDevelopment ? "http://localhost:3000" : "https://app.rip-tool.com"
        return {
          url: `${baseUrl}/${data.clientSlug}/ci/campaigns?upgrade=success`,
        }
      } else {
        throw new Error("You are already on this plan")
      }
    }

    const planPrice = PLAN_PRICES[data.plan]

    const planName = PLAN_DISPLAY_NAMES[data.plan] || data.plan

    const isDevelopment = process.env.NODE_ENV === "development"
    const baseUrl = isDevelopment ? "http://localhost:3000" : "https://app.rip-tool.com"
    const successUrl = `${baseUrl}/${data.clientSlug}/ci/campaigns?success=true`
    const cancelUrl = `${baseUrl}/${data.clientSlug}/billing?canceled=true`

    const lineItems: any[] = [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: planName,
            description: `Monthly subscription to ${planName} plan`,
          },
          unit_amount: planPrice * 100,
          recurring: {
            interval: "month",
          },
        },
        quantity: 1,
      },
    ]

    if (data.plan === "all") {
      const activeUsers = await prisma.user.count({
        where: {
          clientId: client.id,
        },
      })

      const includedSeats = 3
      const additionalSeats = Math.max(0, activeUsers - includedSeats)

      if (additionalSeats > 0) {
        const product = await stripe.products.create({
          name: "Additional User Seats",
          description: `${additionalSeats} additional user seat(s) at $50/seat`,
        })

        const userSeatsPrice = await stripe.prices.create({
          product: product.id,
          currency: "usd",
          unit_amount: 5000, // $50.00
          recurring: {
            interval: "month",
          },
          nickname: "Additional User Seats", // Add nickname for identification
          metadata: {
            type: "user_seats", // Add metadata for identification
          },
        })

        lineItems.push({
          price: userSeatsPrice.id,
          quantity: additionalSeats,
        })
      }
    }

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
        productType: "ci",
      },
    })

    return { url: checkoutSession.url }
  } catch (error) {
    console.error("Error creating CI checkout session:", error)
    throw error
  }
}
