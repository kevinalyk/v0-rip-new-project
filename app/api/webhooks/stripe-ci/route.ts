import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import type Stripe from "stripe"

export async function POST(request: NextRequest) {
  const body = await request.text()
  const sig = request.headers.get("stripe-signature")

  if (!sig) {
    console.error("[Stripe Webhook] No signature found")
    return NextResponse.json({ error: "No signature" }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error("[Stripe Webhook] Signature verification failed:", err)
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  console.log("[Stripe Webhook] Event type:", event.type)

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session
        console.log("[Stripe Webhook] Checkout completed:", session.id)

        if (session.metadata?.productType !== "ci") {
          console.log("[Stripe Webhook] Not a CI checkout, skipping")
          return NextResponse.json({ received: true })
        }

        const clientId = session.client_reference_id || session.metadata?.clientId
        const plan = session.metadata?.plan

        if (!clientId || !plan) {
          console.error("[Stripe Webhook] Missing clientId or plan in metadata")
          return NextResponse.json({ error: "Missing metadata" }, { status: 400 })
        }

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string, {
          expand: ["items.data.price"],
        })

        let userSeatsItemId: string | null = null
        if (subscription.items.data.length > 1) {
          // Multiple items means we have base plan + user seats
          // Find the user seats item by checking metadata or nickname
          const userSeatsItem = subscription.items.data.find((item) => {
            const price = item.price as Stripe.Price
            return price.nickname?.includes("Additional User Seats") || price.metadata?.type === "user_seats"
          })

          if (userSeatsItem) {
            userSeatsItemId = userSeatsItem.id
            console.log("[Stripe Webhook] Found user seats item:", userSeatsItemId)
          }
        }

        await prisma.client.update({
          where: { id: clientId },
          data: {
            subscriptionPlan: plan,
            subscriptionStatus: "active",
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            stripeUserSeatsItemId: userSeatsItemId, // Store the user seats item ID
            subscriptionStartDate: new Date(),
            subscriptionRenewDate: new Date(subscription.current_period_end * 1000),
          },
        })

        console.log("[Stripe Webhook] Client updated with new subscription")
        break
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription
        console.log("[Stripe Webhook] Subscription updated:", subscription.id)

        const client = await prisma.client.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        })

        if (!client) {
          console.log("[Stripe Webhook] Client not found for subscription")
          return NextResponse.json({ received: true })
        }

        await prisma.client.update({
          where: { id: client.id },
          data: {
            subscriptionStatus: subscription.status as any,
            subscriptionRenewDate: new Date(subscription.current_period_end * 1000),
          },
        })

        console.log("[Stripe Webhook] Subscription status updated")
        break
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription
        console.log("[Stripe Webhook] Subscription deleted:", subscription.id)

        const client = await prisma.client.findFirst({
          where: { stripeSubscriptionId: subscription.id },
        })

        if (!client) {
          console.log("[Stripe Webhook] Client not found for subscription")
          return NextResponse.json({ received: true })
        }

        await prisma.client.update({
          where: { id: client.id },
          data: {
            subscriptionPlan: "free",
            subscriptionStatus: "cancelled",
          },
        })

        console.log("[Stripe Webhook] Subscription cancelled, downgraded to free")
        break
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice
        console.log("[Stripe Webhook] Payment failed:", invoice.id)

        const client = await prisma.client.findFirst({
          where: { stripeCustomerId: invoice.customer as string },
        })

        if (!client) {
          console.log("[Stripe Webhook] Client not found for customer")
          return NextResponse.json({ received: true })
        }

        await prisma.client.update({
          where: { id: client.id },
          data: {
            subscriptionStatus: "past_due",
          },
        })

        console.log("[Stripe Webhook] Subscription marked as past_due")
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
