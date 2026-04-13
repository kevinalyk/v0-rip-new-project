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

    // Get clientSlug from query params for super_admins
    const searchParams = request.nextUrl.searchParams
    const clientSlug = searchParams.get("clientSlug")
    
    let targetClientId = user.clientId
    if (user.role === "super_admin" && clientSlug) {
      const targetClient = await prisma.client.findUnique({
        where: { slug: clientSlug },
        select: { id: true },
      })
      if (targetClient) {
        targetClientId = targetClient.id
      }
    }

    const client = await prisma.client.findUnique({
      where: { id: targetClientId },
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

    // Fetch email campaigns from client's personal email
    const emailCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        clientId: targetClientId,
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

    // Fetch SMS from client's personal phone numbers
    const smsCampaigns = await prisma.smsQueue.findMany({
      where: {
        clientId: targetClientId,
        source: "personal",
        isDeleted: false,
        ...(dateFilter && { createdAt: dateFilter }),
      },
      include: {
        entity: true,
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    })

    console.log("[v0] Personal CI API - Client ID:", targetClientId)
    console.log("[v0] Personal CI API - Found email campaigns:", emailCampaigns.length)
    console.log("[v0] Personal CI API - Found SMS campaigns:", smsCampaigns.length)

    const transformedEmailCampaigns = emailCampaigns.map((campaign) => ({
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

    const transformedSmsCampaigns = smsCampaigns.map((sms) => ({
      id: sms.id,
      type: "sms" as const,
      phoneNumber: sms.phoneNumber,
      message: sms.message,
      dateReceived: sms.createdAt.toISOString(),
      ctaLinks: sms.ctaLinks ? JSON.parse(sms.ctaLinks as string) : [],
      entityId: sms.entityId,
      isHidden: sms.isDeleted,
      clientId: sms.clientId,
      source: sms.source,
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

    // Combine and sort by date (most recent first)
    const allCampaigns = [...transformedEmailCampaigns, ...transformedSmsCampaigns].sort(
      (a, b) => new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
    )

    return NextResponse.json({ insights: allCampaigns })
  } catch (error) {
    console.error("Error fetching personal email campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch personal email campaigns" }, { status: 500 })
  }
}
