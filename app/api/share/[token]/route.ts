import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    // Authentication is enforced at the page level (app/share/[token]/page.tsx)
    const token = params.token

    let campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { shareToken: token },
      include: {
        entity: true,
      },
    })

    let isSms = false

    if (!campaign) {
      // Try finding as SMS message
      const smsMessage = await prisma.smsQueue.findUnique({
        where: { shareToken: token },
        include: {
          entity: true,
        },
      })

      if (!smsMessage) {
        return NextResponse.json({ error: "Campaign not found or link expired" }, { status: 404 })
      }

      campaign = smsMessage as any
      isSms = true
    }

    // Note: view count is incremented server-side in app/share/[token]/page.tsx
    // to ensure it fires for all visitors including anonymous users.

    if (isSms) {
      const sms = campaign as any
      return NextResponse.json({
        campaign: {
          id: sms.id,
          type: "sms",
          senderName: sms.phoneNumber || "Unknown",
          phoneNumber: sms.phoneNumber,
          toNumber: sms.toNumber,
          subject: "SMS Message",
          message: sms.message,
          dateReceived: sms.createdAt,
          ctaLinks: sms.ctaLinks ? JSON.parse(sms.ctaLinks) : [],
          entity: sms.entity,
        },
      })
    } else {
      return NextResponse.json({
        campaign: {
          id: campaign.id,
          type: "email",
          senderName: campaign.senderName,
          senderEmail: campaign.senderEmail,
          subject: campaign.subject,
          dateReceived: campaign.dateReceived,
          inboxRate: campaign.inboxRate,
          ctaLinks: Array.isArray(campaign.ctaLinks)
            ? campaign.ctaLinks
            : campaign.ctaLinks
              ? JSON.parse(campaign.ctaLinks as string)
              : [],
          emailContent: campaign.emailContent,
          entity: campaign.entity,
        },
      })
    }
  } catch (error) {
    console.error("Error fetching shared campaign:", error)
    return NextResponse.json({ error: "Failed to fetch campaign" }, { status: 500 })
  }
}
