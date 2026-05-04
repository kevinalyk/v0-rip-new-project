import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { cookies } from "next/headers"
import jwt from "jsonwebtoken"

const prisma = new PrismaClient()

// Domains used for the donationPlatform filter. Mirrors the main
// /api/competitive-insights route so behavior is identical across tabs.
const PLATFORM_DOMAINS: Record<string, string[]> = {
  winred: ["winred.com", "secure.winred.com"],
  actblue: ["actblue.com", "secure.actblue.com"],
  anedot: ["anedot.com"],
  psq: ["psqimpact.com", "secure.psqimpact.com"],
  ngpvan: ["ngpvan.com", "click.ngpvan.com", "secure.ngpvan.com"],
}

// Cap how many rows we'll pull when post-fetch filtering is needed
// (donationPlatform). Prevents a runaway query if a client somehow gets a huge
// SMS volume on personal numbers.
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

    // Plan-based default date window (overridden if the user supplies fromDate/toDate)
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
    const senders = searchParams.getAll("sender") // multi-select
    const party = searchParams.get("party") || undefined
    const state = searchParams.get("state") || undefined
    const messageType = searchParams.get("messageType") || undefined // "email" | "sms"
    const donationPlatform = searchParams.get("donationPlatform") || undefined
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined
    const thirdParty = searchParams.get("thirdParty") === "true"
    const houseFileOnly = searchParams.get("houseFileOnly") === "true"

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10))

    // === Early-exit short-circuits ===
    // Personal numbers is SMS-only. If the UI explicitly filters to email-only,
    // there's nothing here to return.
    if (messageType === "email") {
      return NextResponse.json({
        insights: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      })
    }
    // Personal numbers is by definition house-file (the client's own assigned
    // numbers), never third-party. If the UI is filtering to third-party only,
    // return nothing.
    if (thirdParty && !houseFileOnly) {
      return NextResponse.json({
        insights: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      })
    }

    // Apply user-supplied date overrides on top of the plan-default window.
    if (fromDate) dateFilter = { ...(dateFilter || {}), gte: new Date(fromDate) }
    if (toDate) dateFilter = { ...(dateFilter || {}), lte: new Date(toDate) }

    // Entity-based filters (party / state / sender names) all live on the
    // related CiEntity row and are applied via a relation filter.
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

    // Build the SmsQueue where clause.
    const where: any = {
      clientId: targetClientId,
      source: "personal",
      isDeleted: false,
    }
    if (dateFilter) where.createdAt = dateFilter
    if (Object.keys(entityFilter).length > 0) {
      // `is` ensures we only match rows that actually HAVE an entity satisfying
      // the filter — important because entityId is nullable.
      where.entity = { is: entityFilter }
    }

    // Free-text search across message body, phone number, and the joined
    // entity name. Mirrors the main CI search behavior.
    if (search) {
      where.OR = [
        { message: { contains: search, mode: "insensitive" } },
        { phoneNumber: { contains: search, mode: "insensitive" } },
        { entity: { is: { name: { contains: search, mode: "insensitive" } } } },
      ]
    }

    // === Fetch rows ===
    // donationPlatform can't be filtered at the DB level because ctaLinks is a
    // JSON-in-text column. When it's set, we pull up to SAFETY_LIMIT rows that
    // match all the other filters, then JS-filter and paginate in-memory.
    // Otherwise we paginate at the DB level for efficiency.
    const platformActive = donationPlatform && donationPlatform !== "all"

    if (platformActive) {
      const allRows = await prisma.smsQueue.findMany({
        where,
        include: { entity: true },
        orderBy: { createdAt: "desc" },
        take: SAFETY_LIMIT,
      })

      const domains = PLATFORM_DOMAINS[donationPlatform!] || []
      const matchesPlatform = (sms: (typeof allRows)[number]): boolean => {
        if (domains.length === 0) return false
        let links: any[] = []
        if (sms.ctaLinks) {
          try {
            const parsed = JSON.parse(sms.ctaLinks as unknown as string)
            if (Array.isArray(parsed)) links = parsed
          } catch {
            links = []
          }
        }
        return links.some((link) => {
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
        insights: pageRows.map(transformSms),
        pagination: { total, page, limit, totalPages },
      })
    }

    // Standard path: paginate at the DB.
    const skip = (page - 1) * limit
    const [total, smsCampaigns] = await Promise.all([
      prisma.smsQueue.count({ where }),
      prisma.smsQueue.findMany({
        where,
        include: { entity: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ])

    return NextResponse.json({
      insights: smsCampaigns.map(transformSms),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching personal SMS campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch personal SMS campaigns" }, { status: 500 })
  }
}

// Shape an SmsQueue row into the Campaign payload the UI expects.
function transformSms(sms: any) {
  return {
    id: sms.id,
    type: "sms" as const,
    phoneNumber: sms.phoneNumber,
    message: sms.message,
    emailPreview: sms.message,
    smsContent: sms.message,
    subject: sms.message ? sms.message.slice(0, 80) : "",
    senderName: sms.entity?.name || sms.phoneNumber || "",
    senderEmail: sms.phoneNumber || "",
    dateReceived: sms.createdAt.toISOString(),
    ctaLinks: sms.ctaLinks ? safeParseArray(sms.ctaLinks) : [],
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
