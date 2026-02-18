import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { PLAN_LIMITS, type SubscriptionPlan } from "@/lib/subscription-utils"

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { subscriptionPlan, hasCompetitiveInsights } = body

    // Validate subscription plan
    if (!["starter", "professional", "enterprise"].includes(subscriptionPlan)) {
      return NextResponse.json({ error: "Invalid subscription plan" }, { status: 400 })
    }

    // Get the new plan limits
    const planLimits = PLAN_LIMITS[subscriptionPlan as SubscriptionPlan]

    // Calculate new subscription dates
    const now = new Date()
    const renewDate = new Date(now)
    renewDate.setMonth(renewDate.getMonth() + 1)

    // Update client subscription
    const updatedClient = await prisma.client.update({
      where: { id: user.clientId },
      data: {
        subscriptionPlan,
        hasCompetitiveInsights: hasCompetitiveInsights ?? false,
        emailVolumeLimit:
          planLimits.emailVolumeLimit === Number.POSITIVE_INFINITY
            ? 999999999 // Store a large number for unlimited
            : planLimits.emailVolumeLimit,
        subscriptionStartDate: now,
        subscriptionRenewDate: renewDate,
        lastUsageReset: now,
      },
    })

    return NextResponse.json({
      success: true,
      client: {
        id: updatedClient.id,
        subscriptionPlan: updatedClient.subscriptionPlan,
        hasCompetitiveInsights: updatedClient.hasCompetitiveInsights,
        emailVolumeLimit: updatedClient.emailVolumeLimit,
      },
    })
  } catch (error) {
    console.error("Error updating subscription:", error)
    return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 })
  }
}
