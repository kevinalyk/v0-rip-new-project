import { type NextRequest, NextResponse } from "next/server"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "@/lib/auth"

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { clientId } = await req.json()

    if (!clientId) {
      return NextResponse.json({ error: "Client ID required" }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { client: true },
    })

    if (!user || (user.role !== "owner" && user.role !== "admin")) {
      return NextResponse.json({ error: "Only owners and admins can reactivate subscriptions" }, { status: 403 })
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
    })

    if (!client || !client.stripeSubscriptionId) {
      return NextResponse.json({ error: "No active subscription found" }, { status: 400 })
    }

    // Remove cancel_at_period_end flag from Stripe
    await stripe.subscriptions.update(client.stripeSubscriptionId, {
      cancel_at_period_end: false,
    })

    // Update database
    await prisma.client.update({
      where: { id: clientId },
      data: {
        cancelAtPeriodEnd: false,
        scheduledDowngradePlan: null, // Clear any scheduled downgrade
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Reactivate Subscription] Error:", error)
    return NextResponse.json({ error: "Failed to reactivate subscription" }, { status: 500 })
  }
}
