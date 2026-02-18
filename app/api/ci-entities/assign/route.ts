import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { assignCampaignsToEntity, assignSmsToEntity } from "@/lib/ci-entity-utils"

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
    const { campaignIds, smsIds, entityId, createMapping } = body

    if (
      (!campaignIds || !Array.isArray(campaignIds) || campaignIds.length === 0) &&
      (!smsIds || !Array.isArray(smsIds) || smsIds.length === 0)
    ) {
      return NextResponse.json({ error: "Campaign IDs or SMS IDs are required" }, { status: 400 })
    }

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID is required" }, { status: 400 })
    }

    let emailResult = { success: true, assignedCount: 0, additionalAssignedCount: 0 }
    let smsResult = { success: true, assignedCount: 0, additionalAssignedCount: 0 }

    if (campaignIds && campaignIds.length > 0) {
      emailResult = await assignCampaignsToEntity(campaignIds, entityId, createMapping !== false)
      if (!emailResult.success) {
        return NextResponse.json({ error: emailResult.error }, { status: 400 })
      }
    }

    if (smsIds && smsIds.length > 0) {
      smsResult = await assignSmsToEntity(smsIds, entityId, createMapping !== false)
      if (!smsResult.success) {
        return NextResponse.json({ error: smsResult.error }, { status: 400 })
      }
    }

    return NextResponse.json({
      success: true,
      emailAssignedCount: emailResult.assignedCount,
      emailAdditionalCount: emailResult.additionalAssignedCount,
      smsAssignedCount: smsResult.assignedCount,
      smsAdditionalCount: smsResult.additionalAssignedCount,
    })
  } catch (error) {
    console.error("Error assigning campaigns:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
