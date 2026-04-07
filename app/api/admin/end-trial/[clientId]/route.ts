import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function POST(
  request: NextRequest,
  { params }: { params: { clientId: string } }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { clientId } = params

    // Verify the client exists and is actually a trial (non-free plan, no Stripe)
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    const isTrial =
      client.subscriptionPlan !== "free" &&
      !client.stripeCustomerId &&
      !client.stripeSubscriptionId

    if (!isTrial) {
      return NextResponse.json(
        { error: "This account is not a trial — it either has Stripe billing or is already on the free plan." },
        { status: 400 }
      )
    }

    // Reset to free: clear plan, CI access, and raise volume limits back to default.
    // Users are intentionally left untouched.
    await prisma.client.update({
      where: { id: clientId },
      data: {
        subscriptionPlan: "free",
        hasCompetitiveInsights: false,
        emailVolumeLimit: 20000,
        userSeatsIncluded: 0,
        subscriptionRenewDate: null,
        subscriptionStatus: "active",
        cancelAtPeriodEnd: false,
      },
    })

    return NextResponse.json({ success: true, clientName: client.name })
  } catch (error) {
    console.error("Error ending trial:", error)
    return NextResponse.json({ error: "Failed to end trial" }, { status: 500 })
  }
}
