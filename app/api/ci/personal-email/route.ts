import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { cookies } from "next/headers"
import jwt from "jsonwebtoken"

const prisma = new PrismaClient()

// Donation-platform CTA link domains. Mirrors /api/competitive-insights so
// behavior is identical across the regular CI feed and the personal tabs.
const PLATFORM_DOMAINS: Record<string, string[]> = {
  winred: ["winred.com", "secure.winred.com"],
  actblue: ["actblue.com", "secure.actblue.com"],
  anedot: ["anedot.com"],
  psq: ["psqimpact.com", "secure.psqimpact.com"],
  ngpvan: ["ngpvan.com", "click.ngpvan.com", "secure.ngpvan.com"],
}

// Cap how many rows we'll pull when post-fetch filtering is needed
// (donationPlatform / substack). Same value as /api/competitive-insights.
const SAFETY_LIMIT = 5000

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

    let dateFilter: { gte?: Date; lte?: Date } | undefined
    if (client.subscriptionPlan === "free") {
      const oneDayAgo = new Date()
      oneDayAgo.setHours(oneDayAgo.getHours() - 24)
      dateFilter = { gte: oneDayAgo }
    } else if (client.subscriptionPlan === "paid") {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      dateFilter = { gte: thirtyDaysAgo }
    }

    // === Read all filter params the CompetitiveInsights component sends ===
    const search = (searchParams.get("search") || "").trim()
    const senders = searchParams.getAll("sender")
    const party = searchParams.get("party") || undefined
    const state = searchParams.get("state") || undefined
    const messageType = searchParams.get("messageType") || undefined
    const donationPlatform = searchParams.get("donationPlatform") || undefined
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined
    const thirdParty = searchParams.get("thirdParty") === "true"
    const houseFileOnly = searchParams.get("houseFileOnly") === "true"

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10))

    // Personal email is email-only. SMS-only filter → empty.
    if (messageType === "sms") {
      return NextResponse.json({
        insights: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      })
    }
    // Personal email is by definition house-file. Third-party-only → empty.
    if (thirdParty && !houseFileOnly) {
      return NextResponse.json({
        insights: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      })
    }

    if (fromDate) dateFilter = { ...(dateFilter || {}), gte: new Date(fromDate) }
    if (toDate) dateFilter = { ...(dateFilter || {}), lte: new Date(toDate) }

    const entityFilter: Record<string, unknown> = {}
    if (party && party !== "all") {
      entityFilter.party = { equals: party, mode: "insensitive" }
    }
    if (state && state !== "all") {
      entityFilter.state = { equals: state, mode: "insensitive" }
    }
    if (senders.length > 0) {
      entityFilter.name = { in: senders }
    }

    const where: any = {
      clientId: targetClientId,
      source: "personal",
      isHidden: false,
    }
    if (dateFilter) where.dateReceived = dateFilter
    if (Object.keys(entityFilter).length > 0) {
      where.entity = { is: entityFilter }
    }

    if (search) {
      where.OR = [
        { senderName: { contains: search, mode: "insensitive" } },
        { senderEmail: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { emailPreview: { contains: search, mode: "insensitive" } },
        { entity: { is: { name: { contains: search, mode: "insensitive" } } } },
      ]
    }

    // Substack is a sender-domain filter, not a CTA link filter — it can be
    // pushed into the DB query directly.
    if (donationPlatform === "substack") {
      where.senderEmail = { endsWith: "@substack.com", mode: "insensitive" }
    }

    // === Fetch rows ===
    // Non-substack donationPlatform values require post-fetch JSON filtering
    // on ctaLinks. CompetitiveInsightCampaign DOES have a top-level
    // donationPlatform column, but it's not consistently populated on legacy
    // rows, so we follow the main CI route's approach (cta-link inspection)
    // for parity.
    const platformActive =
      donationPlatform &&
      donationPlatform !== "all" &&
      donationPlatform !== "substack"

    if (platformActive) {
      const allRows = await prisma.competitiveInsightCampaign.findMany({
        where,
        include: { entity: true },
        orderBy: { dateReceived: "desc" },
        take: SAFETY_LIMIT,
      })

      const domains = PLATFORM_DOMAINS[donationPlatform!] || []
      const matchesPlatform = (campaign: (typeof allRows)[number]): boolean => {
        if (domains.length === 0) return false
        const links = safeParseArray(campaign.ctaLinks)
        return links.some((link: any) => {
          const urlsToCheck: string[] = []
          if (typeof link === "string") urlsToCheck.push(link)
          else if (link && typeof link === "object") {
            if (link.strippedFinalUrl) urlsToCheck.push(link.strippedFinalUrl)
            if (link.finalUrl) urlsToCheck.push(link.finalUrl)
            if (link.url) urlsToCheck.push(link.url)
          }
          return urlsToCheck.some((u) =>
            domains.some((d) => u.toLowerCase().includes(d))
          )
        })
      }

      const filtered = allRows.filter(matchesPlatform)
      const total = filtered.length
      const totalPages = Math.max(1, Math.ceil(total / limit))
      const start = (page - 1) * limit
      const pageRows = filtered.slice(start, start + limit)

      return NextResponse.json({
        insights: pageRows.map(transformEmail),
        pagination: { total, page, limit, totalPages },
      })
    }

    // Standard path: paginate at the DB.
    const skip = (page - 1) * limit
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

    return NextResponse.json({
      insights: emailCampaigns.map(transformEmail),
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

// Shape a CompetitiveInsightCampaign row into the Campaign payload the UI expects.
function transformEmail(campaign: any) {
  return {
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
    ctaLinks: safeParseArray(campaign.ctaLinks),
    tags: safeParseArray(campaign.tags),
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
  }
}

function safeParseArray(value: unknown): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}
