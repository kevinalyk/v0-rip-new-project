import { NextResponse } from "next/server"
import { checkAllSeedEmails } from "@/lib/email-checker"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, hasAccessToDomain } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    // Check authentication
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { campaignId } = await request.json()

    if (!campaignId) {
      return NextResponse.json({ error: "Campaign ID is required" }, { status: 400 })
    }

    // Get campaign and check domain access
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { domainId: true, subject: true, sender: true, fromEmail: true, sentDate: true },
    })

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    // Check if user has access to this campaign's domain
    const hasAccess = await hasAccessToDomain(user.id, campaign.domainId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied to this campaign" }, { status: 403 })
    }

    console.log(`Starting email check for campaign: ${campaignId}`)

    // Run the email check
    const result = await checkAllSeedEmails({
      id: campaignId,
      subject: campaign.subject,
      sender: campaign.sender,
      fromEmail: campaign.fromEmail,
      sentDate: campaign.sentDate,
    })

    console.log(`Email check completed for campaign: ${campaignId}`, result)

    return NextResponse.json({
      success: true,
      totalChecked: result.totalChecked,
      newEmails: result.newEmails,
      notDelivered: result.notDelivered,
      details: result.details,
    })
  } catch (error) {
    console.error("Error checking emails:", error)
    return NextResponse.json(
      {
        error: "Failed to check emails",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
