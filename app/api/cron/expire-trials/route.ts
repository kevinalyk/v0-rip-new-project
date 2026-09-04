import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendTrialEndedEmail } from "@/lib/mailgun"

export const runtime = "nodejs"

// Runs daily. Finds clients whose free trial has expired and reverts them to the free plan.
//
// Trials are now Stripe-backed (a card is required at signup and Stripe auto-charges the Basic
// plan when the trial ends). Those trials are handled entirely by the Stripe webhook —
// customer.subscription.updated when the trial converts to Basic, or customer.subscription.
// deleted if it's cancelled/fails to convert — which fires the moment Stripe's own trial clock
// runs out, ahead of this once-daily cron. So this cron only acts on trialExpiresAt for clients
// with no stripeSubscriptionId: legacy/manual trials that were never wired to a Stripe
// subscription (e.g. granted directly by an admin, not through checkout). Reverting a
// Stripe-backed trial here too would race the webhook and could reset a client that Stripe just
// correctly converted to Basic.
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[expire-trials] Checking for expired non-Stripe trials...")

    const expiredTrialClients = await prisma.client.findMany({
      where: {
        trialExpiresAt: { not: null, lt: new Date() },
        stripeSubscriptionId: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        users: {
          where: { role: "owner" },
          select: { firstName: true, email: true },
          take: 1,
        },
      },
    })

    let expiredCount = 0
    let emailsSent = 0

    for (const client of expiredTrialClients) {
      await prisma.client.update({
        where: { id: client.id },
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
        },
      })
      expiredCount++

      const owner = client.users[0]
      if (owner) {
        const sent = await sendTrialEndedEmail({
          firstName: owner.firstName,
          email: owner.email,
          organizationName: client.name,
          clientSlug: client.slug,
        }).catch((err) => {
          console.error(`[expire-trials] Failed to email ${client.id}:`, err)
          return false
        })
        if (sent) emailsSent++
      }
    }

    console.log(`[expire-trials] Expired ${expiredCount} trial(s), sent ${emailsSent} email(s)`)

    return NextResponse.json({ success: true, expiredCount, emailsSent })
  } catch (error) {
    console.error("[expire-trials] Error:", error)
    return NextResponse.json({ error: "Failed to expire trials" }, { status: 500 })
  }
}
