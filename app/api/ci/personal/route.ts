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
      const oneDayAgo = new Date()
      oneDayAgo.setHours(oneDayAgo.getHours() - 24)
      dateFilter = { gte: oneDayAgo }
    } else if (client.subscriptionPlan === "paid") {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      dateFilter = { gte: thirtyDaysAgo }
    }

    // Fetch only campaigns from client's personal email
    const emailCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        clientId: user.clientId,
        source: "personal",
        isHidden: false,
        ...(dateFilter && { dateReceived: dateFilter }),
      },
      include: {
        entity: true,
      },
      orderBy: { dateReceived: "desc" },
      take: 1000,
    })

    console.log("[v0] Personal Email API - Client ID:", user.clientId)
    console.log("[v0] Personal Email API - Found campaigns:", emailCampaigns.length)
    console.log(
      "[v0] Personal Email API - Sample campaign:",
      emailCampaigns[0]
        ? {
            id: emailCampaigns[0].id,
            clientId: emailCampaigns[0].clientId,
            source: emailCampaigns[0].source,
            subject: emailCampaigns[0].subject,
          }
        : "No campaigns",
    )

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
      ctaLinks: campaign.ctaLinks ? JSON.parse(campaign.ctaLinks as string) : [],
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

    return NextResponse.json({ insights: transformedCampaigns })
  } catch (error) {
    console.error("Error fetching personal email campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch personal email campaigns" }, { status: 500 })
  }
}
