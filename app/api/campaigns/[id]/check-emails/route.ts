import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { checkCampaignEmails } from "@/lib/email-checker"
import prisma from "@/lib/prisma"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const campaignId = params.id

    // Get campaign details
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        domain: true,
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    // Check if user has access to this campaign's domain
    if (authResult.user.role !== "admin") {
      const userDomains = await prisma.userDomainAccess.findMany({
        where: { userId: authResult.user.id },
      })
      const userDomainIds = userDomains.map((ud) => ud.domainId)

      if (!userDomainIds.includes(campaign.domainId)) {
        return NextResponse.json({ error: "Access denied" }, { status: 403 })
      }
    }

    // Check emails for this specific campaign
    console.log(`Checking emails for campaign: ${campaign.subject}`)

    const results = await checkCampaignEmails({
      id: campaign.id,
      subject: campaign.subject,
      sender: campaign.sender,
      fromEmail: campaign.fromEmail,
      sentDate: campaign.sentDate,
      domainId: campaign.domainId,
    })

    console.log(`Found ${results.length} results for campaign ${campaign.id}`)

    // Calculate delivery stats
    const totalResults = results.length
    const inboxedResults = results.filter((r) => r.inboxed).length
    const deliveredResults = results.filter((r) => r.delivered).length
    const deliveryRate = totalResults > 0 ? inboxedResults / totalResults : 0

    return NextResponse.json({
      success: true,
      message: `Checked ${totalResults} seed emails, found ${deliveredResults} deliveries (${inboxedResults} inbox)`,
      results: results.length,
      deliveryRate: Math.round(deliveryRate * 100),
      totalChecked: totalResults,
      delivered: deliveredResults,
      inboxed: inboxedResults,
    })
  } catch (error) {
    console.error("Error checking campaign emails:", error)
    return NextResponse.json({ error: "Failed to check emails" }, { status: 500 })
  }
}
