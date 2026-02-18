import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { cookies } from "next/headers"
import jwt from "jsonwebtoken"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })

    if (!user || !user.clientId) {
      return NextResponse.json({ error: "User not found or not associated with a client" }, { status: 404 })
    }

    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
      select: { subscriptionPlan: true },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    let dateFilter: any = undefined
    if (client.subscriptionPlan === "free") {
      // Free: Only last 24 hours
      const oneDayAgo = new Date()
      oneDayAgo.setHours(oneDayAgo.getHours() - 24)
      dateFilter = { gte: oneDayAgo }
    } else if (client.subscriptionPlan === "paid") {
      // Paid: Only last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      dateFilter = { gte: thirtyDaysAgo }
    }
    // For 'all', 'basic_inboxing', 'enterprise': no date filter (full history)

    // Get all subscribed entity IDs
    const subscriptions = await prisma.ciEntitySubscription.findMany({
      where: { clientId: user.clientId },
      include: { entity: true },
    })

    const entityIds = subscriptions.map((sub) => sub.entityId)

    // Fetch campaigns from subscribed entities OR campaigns from client's personal email
    const [emailCampaigns, smsMessages] = await Promise.all([
      prisma.competitiveInsightCampaign.findMany({
        where: {
          entityId: { in: entityIds },
          isHidden: false,
          ...(dateFilter && { dateReceived: dateFilter }),
        },
        include: {
          entity: true,
        },
        orderBy: { dateReceived: "desc" },
        take: 1000,
      }),
      prisma.smsQueue.findMany({
        where: {
          entityId: { in: entityIds },
          processed: true,
          isHidden: false,
          ...(dateFilter && { createdAt: dateFilter }),
        },
        include: {
          entity: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      }),
    ])

    const transformedCampaigns = emailCampaigns.map((campaign) => ({
      id: campaign.id,
      type: "email" as const,
      senderName: campaign.senderName,
      senderEmail: campaign.senderEmail,
      subject: campaign.subject,
      dateReceived: campaign.dateReceived.toISOString(),
      inboxRate: campaign.inboxRate,
      inboxCount: campaign.inboxCount,
      spamCount: campaign.spamCount,
      notDeliveredCount: campaign.notDeliveredCount,
      ctaLinks: Array.isArray(campaign.ctaLinks)
        ? campaign.ctaLinks
        : campaign.ctaLinks
          ? JSON.parse(campaign.ctaLinks as string)
          : [],
      tags: campaign.tags ? JSON.parse(campaign.tags as string) : [],
      emailPreview: campaign.emailPreview || "",
      emailContent: campaign.emailContent,
      entityId: campaign.entityId,
      isHidden: campaign.isHidden,
      clientId: campaign.clientId,
      source: campaign.source,
      entity: campaign.entity
        ? {
            id: campaign.entity.id,
            name: campaign.entity.name,
            type: campaign.entity.type,
            party: campaign.entity.party,
            state: campaign.entity.state,
          }
        : null,
    }))

    const transformedSmsMessages = smsMessages.map((sms) => ({
      id: sms.id, // Keep the actual cuid for API calls
      type: "sms" as const,
      senderName: sms.phoneNumber || "Unknown",
      senderEmail: sms.phoneNumber || "",
      subject: sms.message?.substring(0, 100) || "SMS Message",
      dateReceived: sms.createdAt.toISOString(),
      inboxRate: 100,
      inboxCount: 1,
      spamCount: 0,
      notDeliveredCount: 0,
      ctaLinks: sms.ctaLinks ? JSON.parse(sms.ctaLinks) : [],
      tags: [],
      emailPreview: sms.message || "",
      emailContent: sms.message || null,
      entityId: sms.entityId,
      phoneNumber: sms.phoneNumber,
      toNumber: sms.toNumber,
      isHidden: sms.isHidden,
      entity: sms.entity
        ? {
            id: sms.entity.id,
            name: sms.entity.name,
            type: sms.entity.type,
            party: sms.entity.party,
            state: sms.entity.state,
          }
        : null,
    }))

    // Combine and sort by date
    const allInsights = [...transformedCampaigns, ...transformedSmsMessages].sort((a, b) => {
      return new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
    })

    return NextResponse.json({ insights: allInsights })
  } catch (error) {
    console.error("Error fetching subscribed campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch subscribed campaigns" }, { status: 500 })
  }
}
