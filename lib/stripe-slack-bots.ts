import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"

// Price of each additional (paid, add-on) Slack bot channel, on top of the one free bot
// included with every Slack integration. Subject to change - kept as a constant here so it's
// one place to update, mirroring ADDITIONAL_USER_SEAT_PRICE in lib/subscription-utils.ts.
export const ADDITIONAL_SLACK_BOT_PRICE = 50

/**
 * Updates the client's Stripe subscription quantity for additional Slack bot channels, based
 * on how many non-disconnected SlackChannel rows currently exist for that client. Mirrors
 * lib/stripe-user-seats.ts's updateClientUserSeats: immediate proration (refund on removal,
 * charge on addition), one subscription item whose quantity tracks the count.
 *
 * Not called from any live user flow yet - SLACK_MULTI_BOT_ENABLED gates the routes that would
 * call this. Safe to call directly (e.g. from a script) to test the billing path early.
 */
export async function updateClientSlackBotSeats(clientId: string) {
  try {
    console.log("[v0] Updating Slack bot seats for client:", clientId)

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        stripeSubscriptionId: true,
        stripeSlackBotsItemId: true,
        additionalSlackBots: true,
      },
    })

    if (!client) {
      throw new Error("Client not found")
    }

    if (!client.stripeSubscriptionId) {
      console.log("[v0] No active Stripe subscription found")
      return { success: true, message: "No active subscription" }
    }

    const additionalBotsNeeded = await prisma.slackChannel.count({
      where: { clientId: client.id, status: { not: "disconnected" } },
    })

    console.log("[v0] Slack bot seat calculation:", { additionalBotsNeeded })

    const subscription = await stripe.subscriptions.retrieve(client.stripeSubscriptionId)

    const slackBotsItem = subscription.items.data.find(
      (item) => item.id === client.stripeSlackBotsItemId || item.metadata?.type === "slack_bots",
    )

    if (additionalBotsNeeded === 0) {
      if (slackBotsItem) {
        console.log("[v0] Removing Slack bots line item (no additional bots needed)")
        await stripe.subscriptionItems.del(slackBotsItem.id, {
          proration_behavior: "always_invoice", // Immediate credit/refund
        })

        await prisma.client.update({
          where: { id: clientId },
          data: {
            stripeSlackBotsItemId: null,
            additionalSlackBots: 0,
          },
        })
      }
      return { success: true, message: "No additional Slack bots needed" }
    }

    if (slackBotsItem) {
      console.log("[v0] Updating existing Slack bots item:", {
        currentQuantity: slackBotsItem.quantity,
        newQuantity: additionalBotsNeeded,
      })

      await stripe.subscriptionItems.update(slackBotsItem.id, {
        quantity: additionalBotsNeeded,
        proration_behavior: "always_invoice", // Immediate proration
      })
    } else {
      console.log("[v0] Creating new Slack bots line item:", additionalBotsNeeded)

      const newItem = await stripe.subscriptionItems.create({
        subscription: client.stripeSubscriptionId,
        price_data: {
          currency: "usd",
          product_data: {
            name: "Additional Slack Bot Channels",
            description: `Additional Slack bot channels at $${ADDITIONAL_SLACK_BOT_PRICE}/month each`,
            metadata: {
              type: "slack_bots",
            },
          },
          unit_amount: ADDITIONAL_SLACK_BOT_PRICE * 100,
          recurring: {
            interval: "month",
          },
        },
        quantity: additionalBotsNeeded,
        proration_behavior: "always_invoice", // Immediate proration
      })

      await prisma.client.update({
        where: { id: clientId },
        data: {
          stripeSlackBotsItemId: newItem.id,
          additionalSlackBots: additionalBotsNeeded,
        },
      })
    }

    await prisma.client.update({
      where: { id: clientId },
      data: {
        additionalSlackBots: additionalBotsNeeded,
      },
    })

    console.log("[v0] Successfully updated Slack bot seats")
    return { success: true, additionalSlackBots: additionalBotsNeeded }
  } catch (error) {
    console.error("[v0] Error updating Slack bot seats:", error)
    throw error
  }
}
