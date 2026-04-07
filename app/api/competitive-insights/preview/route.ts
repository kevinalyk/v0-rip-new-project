import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get("id")
    const type = searchParams.get("type") // "email" | "sms"

    if (!id || !type) {
      return NextResponse.json({ error: "Missing id or type" }, { status: 400 })
    }

    if (type === "email") {
      const campaign = await prisma.competitiveInsightCampaign.findUnique({
        where: { id },
        select: {
          id: true,
          subject: true,
          senderEmail: true,
          dateReceived: true,
          emailContent: true,
          emailPreview: true,
          ctaLinks: true,
          entity: { select: { name: true } },
        },
      })

      if (!campaign) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }

      let ctaLinks = []
      try {
        ctaLinks = Array.isArray(campaign.ctaLinks)
          ? campaign.ctaLinks
          : campaign.ctaLinks
          ? JSON.parse(campaign.ctaLinks as string)
          : []
      } catch {
        ctaLinks = []
      }

      return NextResponse.json({
        id: campaign.id,
        type: "email",
        subject: campaign.subject,
        senderEmail: campaign.senderEmail,
        dateReceived: campaign.dateReceived?.toISOString() ?? null,
        emailContent: campaign.emailContent,
        emailPreview: campaign.emailPreview,
        ctaLinks,
        entityName: campaign.entity?.name ?? null,
      })
    }

    if (type === "sms") {
      const sms = await prisma.smsQueue.findUnique({
        where: { id },
        select: {
          id: true,
          message: true,
          phoneNumber: true,
          createdAt: true,
          ctaLinks: true,
          entity: { select: { name: true } },
        },
      })

      if (!sms) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
      }

      let ctaLinks = []
      try {
        ctaLinks = sms.ctaLinks ? JSON.parse(sms.ctaLinks) : []
      } catch {
        ctaLinks = []
      }

      return NextResponse.json({
        id: sms.id,
        type: "sms",
        subject: sms.message?.substring(0, 100) ?? "SMS Message",
        phoneNumber: sms.phoneNumber,
        dateReceived: sms.createdAt?.toISOString() ?? null,
        emailContent: sms.message,
        emailPreview: sms.message,
        ctaLinks,
        entityName: sms.entity?.name ?? null,
      })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error) {
    console.error("[preview] Error fetching preview:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
