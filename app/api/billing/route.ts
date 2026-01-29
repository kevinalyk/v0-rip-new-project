import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getPlanLimits, getUsagePercentage } from "@/lib/subscription-utils"

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Billing API: Getting current user...")
    const user = await getCurrentUser(request)
    console.log("[v0] Billing API: User:", user)

    if (!user) {
      console.log("[v0] Billing API: No user found, returning 401")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Billing API: Fetching client with ID:", user.clientId)

    // Get client billing information
    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
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
