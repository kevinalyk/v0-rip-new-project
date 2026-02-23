import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { calculateAdditionalSeatsNeeded, ADDITIONAL_USER_SEAT_PRICE } from "@/lib/subscription-utils"

/**
 * Updates Stripe subscription quantities based on current user count
 * Called when users are added or removed from a client
 * Provides immediate proration (refund for removals, charge for additions)
 */
export async function updateClientUserSeats(clientId: string) {
  try {
    console.log("[v0] Updating user seats for client:", clientId)

    // Get client with subscription info
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        subscriptionPlan: true,
        stripeSubscriptionId: true,
        stripeUserSeatsItemId: true,
        additionalUserSeats: true,
        userSeatsIncluded: true,
        paidUserSeats: true,
      },
    })

    if (!client) {
      throw new Error("Client not found")
    }

    // Only Pro plan ("all") has user seat billing
    if (client.subscriptionPlan !== "all") {
      console.log("[v0] Client is not on Pro plan, skipping user seat update")
      return { success: true, message: "Not on Pro plan" }
    }

    if (!client.stripeSubscriptionId) {
      console.log("[v0] No active Stripe subscription found")
      return { success: true, message: "No active subscription" }
    }

    const currentUserCount = await prisma.user.count({
      where: { clientId: client.id },
    })

    // If paidUserSeats is set (manual/custom subscription), only charge for seats beyond that number
    let additionalSeatsNeeded: number
    
    if (client.paidUserSeats !== null && client.paidUserSeats > 0) {
      console.log("[v0] Client has paidUserSeats set (custom subscription):", {
        paidUserSeats: client.paidUserSeats,
        currentUserCount,
      })
      
      // Only charge if current users exceed paid seats
      if (currentUserCount > client.paidUserSeats) {
        additionalSeatsNeeded = currentUserCount - client.paidUserSeats
      } else {
        additionalSeatsNeeded = 0
      }
    } else {
      // Standard calculation: charge for seats beyond base plan (3 for Pro)
      additionalSeatsNeeded = calculateAdditionalSeatsNeeded("all", currentUserCount)
    }

    console.log("[v0] User seat calculation:", {
      currentUsers: currentUserCount,
      baseSeatsIncluded: 3,
      additionalSeatsNeeded,
    })

    // Retrieve the subscription
    const subscription = await stripe.subscriptions.retrieve(client.stripeSubscriptionId)

    const userSeatsItem = subscription.items.data.find(
      (item) => item.id === client.stripeUserSeatsItemId || item.metadata?.type === "user_seats",
    )

    if (additionalSeatsNeeded === 0) {
      if (userSeatsItem) {
        console.log("[v0] Removing user seats line item (no additional seats needed)")
        await stripe.subscriptionItems.del(userSeatsItem.id, {
          proration_behavior: "always_invoice", // Immediate credit/refund
        })

        await prisma.client.update({
          where: { id: clientId },
          data: {
            stripeUserSeatsItemId: null,
            additionalUserSeats: 0,
          },
        })
      }
      return { success: true, message: "No additional seats needed" }
    }

    // Additional seats needed
    if (userSeatsItem) {
      console.log("[v0] Updating existing user seats item:", {
        currentQuantity: userSeatsItem.quantity,
        newQuantity: additionalSeatsNeeded,
      })

      await stripe.subscriptionItems.update(userSeatsItem.id, {
        quantity: additionalSeatsNeeded,
        proration_behavior: "always_invoice", // Immediate proration
      })
    } else {
      console.log("[v0] Creating new user seats line item:", additionalSeatsNeeded)

      const newItem = await stripe.subscriptionItems.create({
        subscription: client.stripeSubscriptionId,
        price_data: {
          currency: "usd",
          product_data: {
            name: "Additional User Seats",
            description: `Additional user seats at $${ADDITIONAL_USER_SEAT_PRICE}/month each`,
            metadata: {
              type: "user_seats",
            },
          },
          unit_amount: ADDITIONAL_USER_SEAT_PRICE * 100,
          recurring: {
            interval: "month",
          },
        },
        quantity: additionalSeatsNeeded,
        proration_behavior: "always_invoice", // Immediate proration
      })

      await prisma.client.update({
        where: { id: clientId },
        data: {
          stripeUserSeatsItemId: newItem.id,
          additionalUserSeats: additionalSeatsNeeded,
        },
      })
    }

    await prisma.client.update({
      where: { id: clientId },
      data: {
        additionalUserSeats: additionalSeatsNeeded,
      },
    })

    console.log("[v0] Successfully updated user seats")
    return { success: true, additionalSeats: additionalSeatsNeeded }
  } catch (error) {
    console.error("[v0] Error updating user seats:", error)
    throw error
  }
}
