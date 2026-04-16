import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getPlanLimits, getUsagePercentage } from "@/lib/subscription-utils"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-03-31.basil" })

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Billing API: Getting current user...")
    const user = await getCurrentUser(request)
    console.log("[v0] Billing API: User:", user)

    if (!user) {
      console.log("[v0] Billing API: No user found, returning 401")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Resolve which client to return billing info for.
    // Super admins can view any client's billing by passing ?clientSlug=xxx.
    // Regular users always see their own client.
    const clientSlugParam = request.nextUrl.searchParams.get("clientSlug")
    let targetClientId = user.clientId

    if (clientSlugParam && clientSlugParam !== "admin" && clientSlugParam !== "rip") {
      if (user.role === "super_admin") {
        // Super admins can look up any client
        const targetClient = await prisma.client.findUnique({
          where: { slug: clientSlugParam },
          select: { id: true },
        })
        if (targetClient) targetClientId = targetClient.id
      } else {
        // Regular users: verify the slug matches their own client
        const targetClient = await prisma.client.findUnique({
          where: { slug: clientSlugParam },
          select: { id: true },
        })
        if (targetClient && targetClient.id === user.clientId) {
          targetClientId = targetClient.id
        }
      }
    }

    console.log("[v0] Billing API: Fetching client with ID:", targetClientId)

    // Get client billing information
    const client = await prisma.client.findUnique({
      where: { id: targetClientId },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        hasCompetitiveInsights: true,
        emailVolumeLimit: true,
        emailVolumeUsed: true,
        subscriptionStartDate: true,
        subscriptionRenewDate: true,
        lastUsageReset: true,
        stripeSubscriptionId: true,
        stripeCustomerId: true,
        cancelAtPeriodEnd: true,
        scheduledDowngradePlan: true,
      },
    })

    console.log("[v0] Billing API: Client data:", client)

    if (!client) {
      console.log("[v0] Billing API: Client not found")
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    const planLimits = getPlanLimits(client.subscriptionPlan as any)
    const usagePercentage = getUsagePercentage(client.emailVolumeUsed, client.emailVolumeLimit)

    // Fetch the actual recurring amount from Stripe so we show what they really pay
    let stripeMonthlyAmount: number | null = null
    let stripeBillingInterval: string | null = null
    if (client.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(client.stripeSubscriptionId, {
          expand: ["items.data.price"],
        })
        const item = subscription.items.data[0]
        if (item?.price) {
          stripeMonthlyAmount = item.price.unit_amount // in cents
          stripeBillingInterval = item.price.recurring?.interval ?? null
        }
      } catch (err) {
        console.error("[v0] Billing API: Failed to fetch Stripe subscription price:", err)
      }
    }

    const hasAdminAccess = user.role === "super_admin" || (client.name && client.name.toLowerCase().includes("rip"))
    console.log("[v0] Billing API: hasAdminAccess:", hasAdminAccess, "role:", user.role, "client:", client.name)

    console.log("[v0] Billing API: Returning data with plan limits:", planLimits)

    return NextResponse.json({
      client: {
        id: client.id,
        name: client.name,
        subscriptionPlan: client.subscriptionPlan,
        subscriptionStatus: client.subscriptionStatus,
        hasCompetitiveInsights: client.hasCompetitiveInsights,
        emailVolumeLimit: client.emailVolumeLimit,
        emailVolumeUsed: client.emailVolumeUsed,
        usagePercentage,
        subscriptionStartDate: client.subscriptionStartDate,
        subscriptionRenewDate: client.subscriptionRenewDate,
        lastUsageReset: client.lastUsageReset,
        stripeSubscriptionId: client.stripeSubscriptionId,
        stripeCustomerId: client.stripeCustomerId,
        cancelAtPeriodEnd: client.cancelAtPeriodEnd,
        scheduledDowngradePlan: client.scheduledDowngradePlan,
        stripeMonthlyAmount,   // actual amount in cents from Stripe, or null
        stripeBillingInterval, // "month" | "year" | null
      },
      planLimits,
      hasAdminAccess,
      userRole: user.role,
    })
  } catch (error) {
    console.error("[v0] Billing API: Error fetching billing info:", error)
    return NextResponse.json({ error: "Failed to fetch billing information" }, { status: 500 })
  }
}
