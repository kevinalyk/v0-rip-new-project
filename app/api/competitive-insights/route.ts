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
    const clientSlug = searchParams.get("clientSlug")
    
    // Determine which client to use - for super_admins with clientSlug, use that client
    let targetClientId = authResult.user.clientId!
    if (authResult.user.role === "super_admin" && clientSlug) {
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
      select: { subscriptionPlan: true, id: true },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    const search = searchParams.get("search") || undefined
    const senders = searchParams.getAll("sender").filter(s => s) || []
    const party = searchParams.get("party") || undefined
    const state = searchParams.get("state") || undefined
    const messageType = searchParams.get("messageType") || undefined
    const donationPlatform = searchParams.get("donationPlatform") || undefined
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined
    const page = Number.parseInt(searchParams.get("page") || "1")
    const limit = Number.parseInt(searchParams.get("limit") || "10")
    const tag = searchParams.get("tag") || undefined
    const subscriptionsOnly = searchParams.get("subscriptionsOnly") === "true"
    const thirdParty = searchParams.get("thirdParty") === "true"

    let subscribedEntityIds: string[] = []
    if (subscriptionsOnly) {
      const subscriptions = await prisma.ciEntitySubscription.findMany({
        where: { clientId: targetClientId },
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
          clientId: targetClientId,
          tagName: tag,
        },
        select: { entityId: true },
      })
      taggedEntityIds = taggedEntityIds.map((t) => t.entityId)

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

    // For third-party filter: build the set of "third party" campaign IDs.
    // A campaign is third-party when its entity has at least one mapping AND the campaign's
    // senderEmail/senderDomain is NOT in that entity's specific mappings — mirroring isDomainMappedToEntity in the UI.
    let thirdPartyCampaignIds: string[] | null = null
    if (thirdParty) {
      // Fetch all entity mappings grouped by entity
      const allMappings = await prisma.ciEntityMapping.findMany({
        select: { entityId: true, senderEmail: true, senderDomain: true },
      })

      // Build a lookup: entityId -> { emails: Set, domains: Set }
      const mappingsByEntity: Record<string, { emails: Set<string>; domains: Set<string> }> = {}
      for (const m of allMappings) {
        if (!mappingsByEntity[m.entityId]) {
          mappingsByEntity[m.entityId] = { emails: new Set(), domains: new Set() }
        }
        if (m.senderEmail) mappingsByEntity[m.entityId].emails.add(m.senderEmail.toLowerCase())
        if (m.senderDomain) mappingsByEntity[m.entityId].domains.add(m.senderDomain.toLowerCase())
      }

      const entitiesWithMappings = Object.keys(mappingsByEntity)
      if (entitiesWithMappings.length === 0) {
        // No mappings exist at all — nothing can be third party
        thirdPartyCampaignIds = []
      } else {
        // Fetch all email campaigns whose entity has at least one mapping
        const candidates = await prisma.competitiveInsightCampaign.findMany({
          where: {
            isDeleted: false,
            isHidden: authResult.user.role === "super_admin" ? undefined : false,
            entityId: { in: entitiesWithMappings },
            entity: { type: { not: "data_broker" } },
          },
          select: { id: true, entityId: true, senderEmail: true },
        })

        // Keep only campaigns whose sender is NOT in their entity's mappings
        thirdPartyCampaignIds = candidates
          .filter((c) => {
            if (!c.entityId) return false
            const em = mappingsByEntity[c.entityId]
            if (!em) return false
            const email = c.senderEmail.toLowerCase()
            const domain = email.split("@")[1]
            return !em.emails.has(email) && (!domain || !em.domains.has(domain))
          })
          .map((c) => c.id)
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
      ...(thirdPartyCampaignIds !== null && { id: { in: thirdPartyCampaignIds } }),
    }

    if (search) {
      emailWhere.OR = [
        { senderName: { contains: search, mode: "insensitive" } },
        { senderEmail: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { emailContent: { contains: search, mode: "insensitive" } },
      ]
    }

  if (senders.length > 0) {
    emailWhere.OR = senders.flatMap(sender => [
      { entity: { name: sender } },
      { senderName: sender }
    ])
  }

    if (party && party !== "all") {
      emailWhere.entity = {
        ...emailWhere.entity,
        party: { equals: party, mode: "insensitive" },
      }
    }

    if (state && state !== "all") {
      emailWhere.entity = {
        ...emailWhere.entity,
        state: { equals: state, mode: "insensitive" },
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

  if (senders.length > 0) {
    smsWhere.OR = senders.flatMap(sender => [
      { entity: { name: sender } },
      { phoneNumber: sender }
    ])
  }

    if (party && party !== "all") {
      smsWhere.entity = {
        ...smsWhere.entity,
        party: { equals: party, mode: "insensitive" },
      }
    }

    if (state && state !== "all") {
      smsWhere.entity = {
        ...smsWhere.entity,
        state: { equals: state, mode: "insensitive" },
      }
    }

    let emailInsights: any[] = []
    let smsMessages: any[] = []

    // Third party is email-only (SMS has no domain mapping concept)
    const effectiveMessageType = thirdParty ? "email" : messageType

    const shouldFetchAll = donationPlatform && donationPlatform !== "all"
    const fetchAllForCombining = effectiveMessageType === "all" || !effectiveMessageType
    
    // Safety limit: when fetching all for filtering, cap at 5000 records to prevent timeout
    const SAFETY_LIMIT = 5000

    try {
      if (effectiveMessageType === "all" || effectiveMessageType === "email" || !effectiveMessageType) {
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
  
      }

      if (effectiveMessageType === "all" || effectiveMessageType === "sms" || !effectiveMessageType) {
  
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
                  where: { clientId: targetClientId },
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
      // Substack is a sender-domain filter, not a CTA link filter
      if (donationPlatform === "substack") {
        allInsights = allInsights.filter((insight) =>
          insight.senderEmail?.toLowerCase().endsWith("@substack.com")
        )
      } else {
        const platformDomains: Record<string, string[]> = {
          winred: ["winred.com", "secure.winred.com"],
          actblue: ["actblue.com", "secure.actblue.com"],
          anedot: ["anedot.com"],
          psq: ["psqimpact.com", "secure.psqimpact.com"],
          ngpvan: ["ngpvan.com", "click.ngpvan.com", "secure.ngpvan.com"],
        }
        const domains = platformDomains[donationPlatform] || []

        allInsights = allInsights.filter((insight) => {
          const ctaLinks = insight.ctaLinks || []
          return ctaLinks.some((link: any) => {
            let urlsToCheck: string[] = []
            if (typeof link === "string") {
              urlsToCheck = [link]
            } else {
              if (link.strippedFinalUrl) urlsToCheck.push(link.strippedFinalUrl)
              if (link.finalUrl) urlsToCheck.push(link.finalUrl)
              if (link.url) urlsToCheck.push(link.url)
            }
            return urlsToCheck.some((url) =>
              domains.some((domain) => url.toLowerCase().includes(domain))
            )
          })
        })
      }
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
