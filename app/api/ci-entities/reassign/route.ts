import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { campaignId, entityId, campaignType } = body

    if (!campaignId || !entityId || !campaignType) {
      return NextResponse.json({ error: "Campaign ID, entity ID, and campaign type are required" }, { status: 400 })
    }

    // Update the campaign or SMS with new entity
    if (campaignType === "email") {
      await prisma.competitiveInsightCampaign.update({
        where: { id: campaignId },
        data: {
          entityId,
          assignmentMethod: "manual",
          assignedAt: new Date(),
        },
      })
    } else if (campaignType === "sms") {
      await prisma.smsQueue.update({
        where: { id: campaignId },
        data: {
          entityId,
          assignmentMethod: "manual",
          assignedAt: new Date(),
        },
      })
    } else {
      return NextResponse.json({ error: "Invalid campaign type" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error reassigning campaign:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
