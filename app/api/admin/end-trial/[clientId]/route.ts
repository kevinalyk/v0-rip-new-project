import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { stripe } from "@/lib/stripe"

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

    // Verify the client exists and is actually a trial (either a code-redeemed trial with
    // trialExpiresAt set, or the older heuristic of a non-free plan with no Stripe billing)
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        trialExpiresAt: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    const isTrial =
      client.trialExpiresAt !== null ||
      (client.subscriptionPlan !== "free" && !client.stripeCustomerId && !client.stripeSubscriptionId)

    if (!isTrial) {
      return NextResponse.json(
        { error: "This account is not a trial — it either has Stripe billing or is already on the free plan." },
        { status: 400 }
      )
    }

    // If this is a Stripe-backed trial (created via checkout with a card on file), cancel the
    // Stripe subscription immediately so it can't later auto-charge the card for Basic. This
    // also fires customer.subscription.deleted, which independently resets the same fields
    // below — that's expected and harmless (idempotent), it just means the webhook re-confirms
    // what we're about to set here.
    if (client.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(client.stripeSubscriptionId)
        console.log("[end-trial] Cancelled Stripe subscription:", client.stripeSubscriptionId)
      } catch (err) {
        console.error("[end-trial] Failed to cancel Stripe subscription, continuing with local reset:", err)
      }
    }

    // Reset to free: clear plan, CI access, trial state, and raise volume limits back to
    // default. trialEndedNoticeSeen is set to false so the "trial ended" popup shows once on
    // the next login, same as when a trial expires naturally via the cron. Users are
    // intentionally left untouched.
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
        trialExpiresAt: null,
        trialEndedNoticeSeen: false,
        pendingTrialCodeId: null,
        pendingTrialLengthDays: null,
        stripeSubscriptionId: null,
        stripeSubscriptionItemId: null,
      },
    })

    return NextResponse.json({ success: true, clientName: client.name })
  } catch (error) {
    console.error("Error ending trial:", error)
    return NextResponse.json({ error: "Failed to end trial" }, { status: 500 })
  }
}
