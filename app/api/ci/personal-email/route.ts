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

    // Pagination params (same names as the main CI component sends)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10))
    const skip = (page - 1) * limit

    const where = {
      clientId: targetClientId,
      source: "personal",
      isHidden: false,
      ...(dateFilter && { dateReceived: dateFilter }),
    }

    // Fetch total count and paginated records in parallel
    const [total, emailCampaigns] = await Promise.all([
      prisma.competitiveInsightCampaign.count({ where }),
      prisma.competitiveInsightCampaign.findMany({
        where,
        include: { entity: true },
        orderBy: { dateReceived: "desc" },
        skip,
        take: limit,
      }),
    ])

    // Safe JSON parse helper — handles already-parsed objects, strings, and nulls
    const safeParse = (value: any): any[] => {
      if (!value) return []
      if (typeof value === "string") {
        try { return JSON.parse(value) } catch { return [] }
      }
      return Array.isArray(value) ? value : []
    }

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
      ctaLinks: safeParse(campaign.ctaLinks),
      tags: safeParse(campaign.tags),
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

    return NextResponse.json({
      insights: transformedEmailCampaigns,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching personal email campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch personal email campaigns" }, { status: 500 })
  }
}
