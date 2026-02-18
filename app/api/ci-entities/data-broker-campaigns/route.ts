import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    // Fetch all campaigns assigned to data broker entities
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        isDeleted: false,
        entity: {
          type: "data_broker",
        },
      },
      include: {
        entity: true,
      },
      orderBy: {
        dateReceived: "desc",
      },
      take: 500, // Limit to last 500 for performance
    })

    const smsMessages = await prisma.smsQueue.findMany({
      where: {
        isDeleted: false,
        entity: {
          type: "data_broker",
        },
      },
      include: {
        entity: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 500,
    })

    // Transform to match campaign format
    const formattedCampaigns = campaigns.map((c) => ({
      id: c.id,
      senderName: c.senderName,
      senderEmail: c.senderEmail,
      subject: c.subject,
      dateReceived: c.dateReceived,
      inboxRate: c.inboxRate,
      type: "email" as const,
      emailContent: c.emailContent,
      ctaLinks: c.ctaLinks,
      entity: c.entity,
      entityId: c.entityId,
    }))

    const formattedSms = smsMessages.map((s) => ({
      id: s.id,
      senderName: s.phoneNumber,
      senderEmail: s.phoneNumber,
      subject: s.message?.substring(0, 100) || "SMS Message",
      dateReceived: s.createdAt,
      inboxRate: 100,
      type: "sms" as const,
      phoneNumber: s.phoneNumber,
      message: s.message,
      ctaLinks: s.ctaLinks,
      entity: s.entity,
      entityId: s.entityId,
    }))

    return NextResponse.json({
      campaigns: [...formattedCampaigns, ...formattedSms],
    })
  } catch (error) {
    console.error("Error fetching data broker campaigns:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
