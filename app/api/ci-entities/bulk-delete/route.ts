import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function DELETE(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { campaignIds, campaignTypes } = await request.json()

    if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
      return NextResponse.json({ error: "No campaign IDs provided" }, { status: 400 })
    }

    let emailDeleted = 0
    let smsDeleted = 0

    for (let i = 0; i < campaignIds.length; i++) {
      const id = campaignIds[i]
      const type = campaignTypes?.[i] ?? "email"

      if (type === "sms") {
        await prisma.competitiveInsightSMSMessage.delete({ where: { id } }).catch(() => null)
        smsDeleted++
      } else {
        await prisma.competitiveInsightCampaign.delete({ where: { id } }).catch(() => null)
        emailDeleted++
      }
    }

    return NextResponse.json({ success: true, emailDeleted, smsDeleted, total: emailDeleted + smsDeleted })
  } catch (error) {
    console.error("[bulk-delete] Error:", error)
    return NextResponse.json({ error: "Failed to delete campaigns" }, { status: 500 })
  }
}
