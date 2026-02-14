import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const client = await prisma.client.findUnique({
      where: { id: authResult.user.clientId! },
      select: { subscriptionPlan: true, id: true },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    const searchParams = request.nextUrl.searchParams
    const search = searchParams.get("search") || ""
    const sender = searchParams.get("sender") || ""
    const party = searchParams.get("party") || ""
    const messageType = searchParams.get("messageType") || ""
    const donationPlatform = searchParams.get("donationPlatform") || ""
    const fromDate = searchParams.get("fromDate")
    const toDate = searchParams.get("toDate")
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "10")
    const tag = searchParams.get("tag") || ""
    const subscriptionsOnly = searchParams.get("subscriptionsOnly") === "true"

    console.log("[v0] API params:", {
      search,
      sender,
      party,
      messageType,
      donationPlatform,
      donationPlatformRaw: searchParams.get("donationPlatform"),
      page,
      limit,
      tag,
      subscriptionsOnly,
    })

    let subscribedEntityIds: string[] = []
    if (subscriptionsOnly) {
      const subscriptions = await prisma.ciEntitySubscription.findMany({
        where: { clientId: authResult.user.clientId! },
        select: { entityId: true },
      })
      subscribedEntityIds = subscriptions.map((sub) => sub.entityId)

      if (subscribedEntityIds.length === 0) {
        return NextResponse.json({
          insights: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        })
      }
    }

    let taggedEntityIds: string[] = []
    if (tag && tag !== "all") {
      const taggedEntities = await prisma.entityTag.findMany({
        where: {
          clientId: authResult.user.clientId!,
          tagName: tag,
        },
        select: { entityId: true },
      })
      taggedEntityIds = taggedEntities.map((t) => t.entityId)

      if (taggedEntityIds.length === 0) {
        return NextResponse.json({
          insights: [],
          pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0,
          },
        })
      }
    }

    const skip = (page - 1) * limit

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

    if (fromDate || toDate) {
      if (!dateFilter) dateFilter = {}
      if (fromDate) {
        const from = new Date(fromDate)
        from.setHours(0, 0, 0, 0)
        dateFilter.gte = from
      }
      if (toDate) {
        const to = new Date(toDate)
        to.setHours(23, 59, 59, 999)
        dateFilter.lte = to
      }
    }

    const emailWhere: any = {
      isHidden: authResult.user.role === "super_admin" ? undefined : false,
      isDeleted: false,
      entityId: { not: null },
      entity: {
        type: { not: "data_broker" },
      },
      ...(dateFilter && { dateReceived: dateFilter }),
      ...(subscriptionsOnly && subscribedEntityIds.length > 0 && { entityId: { in: subscribedEntityIds } }),
      ...(taggedEntityIds.length > 0 && { entityId: { in: taggedEntityIds } }),
    }

    if (search) {
      emailWhere.OR = [
        { senderName: { contains: search, mode: "insensitive" } },
        { senderEmail: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { emailContent: { contains: search, mode: "insensitive" } },
      ]
    }

    if (sender && sender !== "all") {
      emailWhere.OR = [{ entity: { name: sender } }, { senderName: sender }]
    }

    if (party && party !== "all") {
      emailWhere.entity = {
        ...emailWhere.entity,
        party: { equals: party, mode: "insensitive" },
      }
    }

    const smsWhere: any = {
      processed: true,
      isHidden: authResult.user.role === "super_admin" ? undefined : false,
      isDeleted: false,
      entityId: { not: null },
      entity: {
        type: { not: "data_broker" },
      },
      ...(dateFilter && { createdAt: dateFilter }),
      ...(subscriptionsOnly && subscribedEntityIds.length > 0 && { entityId: { in: subscribedEntityIds } }),
      ...(taggedEntityIds.length > 0 && { entityId: { in: taggedEntityIds } }),
    }

    if (search) {
      smsWhere.OR = [
        { phoneNumber: { contains: search } },
        { toNumber: { contains: search } },
        { message: { contains: search, mode: "insensitive" } },
      ]
    }

    if (sender && sender !== "all") {
      smsWhere.OR = [{ entity: { name: sender } }, { phoneNumber: sender }]
    }

    if (party && party !== "all") {
      smsWhere.entity = {
        ...smsWhere.entity,
        party: { equals: party, mode: "insensitive" },
      }
    }

    let emailInsights: any[] = []
    let smsMessages: any[] = []

    const shouldFetchAll = donationPlatform && donationPlatform !== "all"
    const fetchAllForCombining = messageType === "all" || !messageType
    
    // Safety limit: when fetching all for filtering, cap at 5000 records to prevent timeout
    const SAFETY_LIMIT = 5000

    console.log("[v0] Fetch strategy:", { shouldFetchAll, fetchAllForCombining, donationPlatform })

    try {
      if (messageType === "all" || messageType === "email" || !messageType) {
        console.log("[v0] About to fetch emails...")
        const emailQuery = {
          where: emailWhere,
          include: {
            entity: {
              select: {
                id: true,
                name: true,
                type: true,
                party: true,
                state: true,
                tags: {
                  where: { clientId: authResult.user.clientId! },
                  select: {
                    tagName: true,
                    tagColor: true,
                  },
                },
              },
            },
          },
          orderBy: {
            dateReceived: "desc",
          } as const,
          ...(shouldFetchAll || fetchAllForCombining
            ? { take: SAFETY_LIMIT }
            : { skip, take: limit }),
        }
        
        console.log("[v0] Email query params:", { 
          shouldFetchAll, 
          fetchAllForCombining, 
          skip, 
          take: shouldFetchAll || fetchAllForCombining ? SAFETY_LIMIT : limit 
        })
        
        emailInsights = await prisma.competitiveInsightCampaign.findMany(emailQuery)
        console.log("[v0] Fetched emails:", emailInsights.length)
      }

      if (messageType === "all" || messageType === "sms" || !messageType) {
        console.log("[v0] About to fetch SMS...")
        const smsQuery = {
          where: smsWhere,
          include: {
            entity: {
              select: {
                id: true,
                name: true,
                type: true,
                party: true,
                state: true,
                tags: {
                  where: { clientId: authResult.user.clientId! },
                  select: {
                    tagName: true,
                    tagColor: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          } as const,
          ...(shouldFetchAll || fetchAllForCombining
            ? { take: SAFETY_LIMIT }
            : { skip, take: limit }),
        }
        
        console.log("[v0] SMS query params:", { 
          shouldFetchAll, 
          fetchAllForCombining, 
          skip, 
          take: shouldFetchAll || fetchAllForCombining ? SAFETY_LIMIT : limit 
        })
        
        smsMessages = await prisma.smsQueue.findMany(smsQuery)
        console.log("[v0] Fetched SMS:", smsMessages.length)
      }
    } catch (dbError) {
      console.error("[v0] Database query error:", dbError)
      throw dbError
    }

    console.log("[v0] Raw results:", { emailCount: emailInsights.length, smsCount: smsMessages.length })

    const parsedEmailInsights = emailInsights.map((insight) => {
      let ctaLinks = []
      let tags = []
      
      try {
        ctaLinks = Array.isArray(insight.ctaLinks)
          ? insight.ctaLinks
          : insight.ctaLinks
            ? JSON.parse(insight.ctaLinks as string)
            : []
      } catch (e) {
        console.error("[v0] Error parsing ctaLinks for insight", insight.id, e)
        ctaLinks = []
      }
      
      try {
        tags = Array.isArray(insight.tags) 
          ? insight.tags 
          : insight.tags 
            ? JSON.parse(insight.tags as string) 
            : []
      } catch (e) {
        console.error("[v0] Error parsing tags for insight", insight.id, e)
        tags = []
      }
      
      return {
        ...insight,
        type: "email" as const,
        ctaLinks,
        tags,
        clientId: insight.clientId,
        source: insight.source,
      }
    })

    const parsedSmsInsights = smsMessages.map((sms) => {
      let ctaLinks = []
      
      try {
        ctaLinks = sms.ctaLinks ? JSON.parse(sms.ctaLinks) : []
      } catch (e) {
        console.error("[v0] Error parsing ctaLinks for SMS", sms.id, e)
        ctaLinks = []
      }
      
      return {
        id: sms.id,
        type: "sms" as const,
        senderName: sms.phoneNumber || "Unknown",
        senderEmail: sms.phoneNumber || "",
        subject: sms.message?.substring(0, 100) || "SMS Message",
        dateReceived: sms.createdAt.toISOString(),
        inboxRate: 100,
        inboxCount: 1,
        spamCount: 0,
        notDeliveredCount: 0,
        ctaLinks,
        tags: [],
        emailPreview: sms.message || "",
        emailContent: sms.message || null,
        entityId: sms.entityId,
        entity: sms.entity || null,
        phoneNumber: sms.phoneNumber,
        toNumber: sms.toNumber,
        isHidden: sms.isHidden,
        clientId: null,
        source: "seed",
      }
    })

    let allInsights = [...parsedEmailInsights, ...parsedSmsInsights].sort((a, b) => {
      const dateA = new Date(a.dateReceived).getTime()
      const dateB = new Date(b.dateReceived).getTime()
      return dateB - dateA
    })

    console.log("[v0] Combined insights before platform filter:", allInsights.length)

    if (donationPlatform && donationPlatform !== "all") {
      const platformDomains: Record<string, string[]> = {
        winred: ["winred.com", "secure.winred.com"],
        actblue: ["actblue.com", "secure.actblue.com"],
        anedot: ["anedot.com"],
        psq: ["psqimpact.com", "secure.psqimpact.com"],
        ngpvan: ["ngpvan.com", "click.ngpvan.com", "secure.ngpvan.com"],
      }
      const domains = platformDomains[donationPlatform] || []
      console.log("[v0] Filtering for platform:", donationPlatform, "domains:", domains)

      console.log(
        "[v0] Sample insight ctaLinks:",
        allInsights.slice(0, 3).map((i) => ({
          id: i.id,
          sender: i.senderName,
          ctaLinks: i.ctaLinks,
        })),
      )

      allInsights = allInsights.filter((insight) => {
        const ctaLinks = insight.ctaLinks || []
        const hasMatchingLink = ctaLinks.some((link: any) => {
          let urlToCheck = ""
          if (typeof link === "string") {
            urlToCheck = link
          } else if (link.finalUrl) {
            urlToCheck = link.finalUrl
          } else if (link.url) {
            urlToCheck = link.url
          }
          const matches = domains.some((domain) => urlToCheck.toLowerCase().includes(domain))
          if (matches) {
            console.log("[v0] Found matching link:", urlToCheck, "for platform:", donationPlatform)
          }
          return matches
        })

        return hasMatchingLink
      })

      console.log("[v0] Insights after platform filter:", allInsights.length)
    }

    const totalCount = allInsights.length

    const paginatedInsights = allInsights.slice(skip, skip + limit)

    console.log("[v0] Final paginated results:", paginatedInsights.length)

    return NextResponse.json({
      insights: paginatedInsights,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("[v0] Error fetching competitive insights:", error)
    return NextResponse.json({ error: "Failed to fetch competitive insights" }, { status: 500 })
  }
}
