import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { normalizeSubject } from "@/lib/campaign-detector"

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
    const houseFileOnly = searchParams.get("houseFileOnly") === "true"

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
      const threeHoursAgo = new Date()
      threeHoursAgo.setHours(threeHoursAgo.getHours() - 3)
      dateFilter = { gte: threeHoursAgo }
    } else if (client.subscriptionPlan === "paid") {
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      dateFilter = { gte: threeDaysAgo }
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

    // For house-file-only filter: exclude any campaign that is "third party".
    // A campaign is third-party when its entity has at least one mapping AND the sender is NOT in those mappings.
    // House file = everything that is NOT third party (entities with no mappings are treated as house file by default).
    let houseFileCampaignIds: string[] | null = null
    if (houseFileOnly) {
      const [allMappings, allEntities] = await Promise.all([
        prisma.ciEntityMapping.findMany({
          select: { entityId: true, senderEmail: true, senderDomain: true },
        }),
        prisma.ciEntity.findMany({ select: { id: true, donationIdentifiers: true } }),
      ])

      const mappingsByEntity: Record<string, { emails: Set<string>; domains: Set<string> }> = {}
      for (const m of allMappings) {
        if (!mappingsByEntity[m.entityId]) {
          mappingsByEntity[m.entityId] = { emails: new Set(), domains: new Set() }
        }
        if (m.senderEmail) mappingsByEntity[m.entityId].emails.add(m.senderEmail.toLowerCase())
        if (m.senderDomain) mappingsByEntity[m.entityId].domains.add(m.senderDomain.toLowerCase())
      }
      // Inject Substack handles as synthetic email mappings
      for (const entity of allEntities) {
        const handle = (entity.donationIdentifiers as any)?.substack as string | undefined
        if (handle) {
          if (!mappingsByEntity[entity.id]) mappingsByEntity[entity.id] = { emails: new Set(), domains: new Set() }
          mappingsByEntity[entity.id].emails.add(`${handle.toLowerCase()}@substack.com`)
        }
      }

      const entitiesWithMappings = new Set(Object.keys(mappingsByEntity))

      // Fetch all email campaigns
      const candidates = await prisma.competitiveInsightCampaign.findMany({
        where: {
          isDeleted: false,
          isHidden: authResult.user.role === "super_admin" ? undefined : false,
          entityId: { not: null },
          entity: { type: { not: "data_broker" } },
        },
        select: { id: true, entityId: true, senderEmail: true },
      })

      houseFileCampaignIds = candidates
        .filter((c) => {
          if (!c.entityId) return false
          // Entity has no mappings → not third party → house file, keep
          if (!entitiesWithMappings.has(c.entityId)) return true
          const em = mappingsByEntity[c.entityId]
          if (!em) return true
          const email = c.senderEmail.toLowerCase()
          const domain = email.split("@")[1]
          // Third party = sender NOT in entity's mappings → exclude
          const isThirdParty = !em.emails.has(email) && (!domain || !em.domains.has(domain))
          return !isThirdParty
        })
        .map((c) => c.id)
    }

    // For third-party filter: build the set of "third party" campaign IDs.
    // A campaign is third-party when its entity has at least one mapping AND the campaign's
    // senderEmail/senderDomain is NOT in that entity's specific mappings — mirroring isDomainMappedToEntity in the UI.
    let thirdPartyCampaignIds: string[] | null = null
    if (thirdParty) {
      const [allMappings, allEntities] = await Promise.all([
        prisma.ciEntityMapping.findMany({
          select: { entityId: true, senderEmail: true, senderDomain: true },
        }),
        prisma.ciEntity.findMany({ select: { id: true, donationIdentifiers: true } }),
      ])

      // Build a lookup: entityId -> { emails: Set, domains: Set }
      const mappingsByEntity: Record<string, { emails: Set<string>; domains: Set<string> }> = {}
      for (const m of allMappings) {
        if (!mappingsByEntity[m.entityId]) {
          mappingsByEntity[m.entityId] = { emails: new Set(), domains: new Set() }
        }
        if (m.senderEmail) mappingsByEntity[m.entityId].emails.add(m.senderEmail.toLowerCase())
        if (m.senderDomain) mappingsByEntity[m.entityId].domains.add(m.senderDomain.toLowerCase())
      }
      // Inject Substack handles as synthetic email mappings
      for (const entity of allEntities) {
        const handle = (entity.donationIdentifiers as any)?.substack as string | undefined
        if (handle) {
          if (!mappingsByEntity[entity.id]) mappingsByEntity[entity.id] = { emails: new Set(), domains: new Set() }
          mappingsByEntity[entity.id].emails.add(`${handle.toLowerCase()}@substack.com`)
        }
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
      ...(houseFileCampaignIds !== null && { id: { in: houseFileCampaignIds } }),
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
    emailWhere.entity = {
      ...emailWhere.entity,
      name: { in: senders },
    }
  }

    if (party && party !== "all") {
      // "third party" dropdown value should match both "third party" and "independent" in DB
      if (party.toLowerCase() === "third party") {
        emailWhere.entity = {
          ...emailWhere.entity,
          OR: [
            { party: { equals: "third party", mode: "insensitive" } },
            { party: { equals: "independent", mode: "insensitive" } },
            { party: { equals: "ind", mode: "insensitive" } },
          ],
        }
      } else {
        emailWhere.entity = {
          ...emailWhere.entity,
          party: { equals: party, mode: "insensitive" },
        }
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
    smsWhere.entity = {
      ...smsWhere.entity,
      name: { in: senders },
    }
  }

    if (party && party !== "all") {
      // "third party" dropdown value should match both "third party" and "independent" in DB
      if (party.toLowerCase() === "third party") {
        smsWhere.entity = {
          ...smsWhere.entity,
          OR: [
            { party: { equals: "third party", mode: "insensitive" } },
            { party: { equals: "independent", mode: "insensitive" } },
            { party: { equals: "ind", mode: "insensitive" } },
          ],
        }
      } else {
        smsWhere.entity = {
          ...smsWhere.entity,
          party: { equals: party, mode: "insensitive" },
        }
      }
    }

    if (state && state !== "all") {
      smsWhere.entity = {
        ...smsWhere.entity,
        state: { equals: state, mode: "insensitive" },
      }
    }

    // Build SMS third-party / house-file ID sets using senderPhone mappings.
    // Also includes senderDomain values that are numeric-only (SMS short codes stored there).
    let thirdPartySmsIds: string[] | null = null
    let houseFileSmsIds: string[] | null = null
    if (thirdParty || houseFileOnly) {
      const phoneMappings = await prisma.ciEntityMapping.findMany({
        where: {
          OR: [
            { senderPhone: { not: null } },
            // Short codes are stored as numeric-only senderDomain values
            { senderDomain: { not: null } },
          ],
        },
        select: { entityId: true, senderPhone: true, senderDomain: true },
      })

      const phonesByEntity: Record<string, Set<string>> = {}
      for (const m of phoneMappings) {
        if (!phonesByEntity[m.entityId]) phonesByEntity[m.entityId] = new Set()
        if (m.senderPhone) phonesByEntity[m.entityId].add(m.senderPhone)
        // Mirror numeric-only senderDomain values as phone/short code identifiers
        if (m.senderDomain && /^\d+$/.test(m.senderDomain.trim())) {
          phonesByEntity[m.entityId].add(m.senderDomain.trim())
        }
      }

      const entitiesWithPhoneMappings = new Set(Object.keys(phonesByEntity))

      const smsCandidates = await prisma.smsQueue.findMany({
        where: {
          isDeleted: false,
          isHidden: authResult.user.role === "super_admin" ? undefined : false,
          entityId: { not: null },
          entity: { type: { not: "data_broker" } },
          ...(thirdParty ? { entityId: { in: [...entitiesWithPhoneMappings] } } : {}),
        },
        select: { id: true, entityId: true, phoneNumber: true },
      })

      if (thirdParty) {
        thirdPartySmsIds = smsCandidates
          .filter((s) => {
            if (!s.entityId) return false
            const phones = phonesByEntity[s.entityId]
            if (!phones) return false
            return !phones.has(s.phoneNumber ?? "")
          })
          .map((s) => s.id)
      } else {
        houseFileSmsIds = smsCandidates
          .filter((s) => {
            if (!s.entityId) return false
            if (!entitiesWithPhoneMappings.has(s.entityId)) return true
            const phones = phonesByEntity[s.entityId]
            if (!phones) return true
            return phones.has(s.phoneNumber ?? "")
          })
          .map((s) => s.id)
      }
    }

    // Apply SMS third-party / house-file ID filter to smsWhere
    if (thirdPartySmsIds !== null) smsWhere.id = { in: thirdPartySmsIds }
    if (houseFileSmsIds !== null) smsWhere.id = { in: houseFileSmsIds }

    let emailInsights: any[] = []
    let smsMessages: any[] = []
    let emailCount = 0
    let smsCount = 0

    const effectiveMessageType = messageType

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
        
        // When fetching a single page (email-only, no donation platform filter), run a
        // parallel count query so the total isn't capped at the page size
        if (!shouldFetchAll && !fetchAllForCombining) {
          const [rows, count] = await Promise.all([
            prisma.competitiveInsightCampaign.findMany(emailQuery),
            prisma.competitiveInsightCampaign.count({ where: emailWhere }),
          ])
          emailInsights = rows
          emailCount = count
        } else {
          emailInsights = await prisma.competitiveInsightCampaign.findMany(emailQuery)
          emailCount = emailInsights.length
        }

        // Display-side dedup: if two rows share senderEmail + same calendar day + same
        // normalized subject, keep only the [Omitted] version (or highest inboxCount if neither has it).
        const dedupMap = new Map<string, typeof emailInsights[0]>()
        for (const insight of emailInsights) {
          const day = insight.dateReceived
            ? new Date(insight.dateReceived).toISOString().slice(0, 10)
            : "unknown"
          const key = `${insight.senderEmail}__${day}__${normalizeSubject(insight.subject || "")}`
          const existing = dedupMap.get(key)
          if (!existing) {
            dedupMap.set(key, insight)
          } else {
            // Prefer the [Omitted] version; if both or neither have it, prefer higher inboxCount
            const incomingHasOmitted = (insight.subject || "").includes("[Omitted]")
            const existingHasOmitted = (existing.subject || "").includes("[Omitted]")
            if (incomingHasOmitted && !existingHasOmitted) {
              dedupMap.set(key, insight)
            } else if (!incomingHasOmitted && existingHasOmitted) {
              // keep existing
            } else if ((insight.inboxCount ?? 0) > (existing.inboxCount ?? 0)) {
              dedupMap.set(key, insight)
            }
          }
        }
        emailInsights = Array.from(dedupMap.values())

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
        
        if (!shouldFetchAll && !fetchAllForCombining) {
          const [rows, count] = await Promise.all([
            prisma.smsQueue.findMany(smsQuery),
            prisma.smsQueue.count({ where: smsWhere }),
          ])
          smsMessages = rows
          smsCount = count
        } else {
          smsMessages = await prisma.smsQueue.findMany(smsQuery)
          smsCount = smsMessages.length
        }
  
      }
    } catch (dbError) {
      console.error("Database query error:", dbError)
      throw dbError
    }

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
        clientId: sms.clientId || null,
        source: sms.source || "seed",
        shareCount: sms.shareCount || 0,
        shareViewCount: sms.shareViewCount || 0,
        viewCount: sms.viewCount || 0,
      }
    })

    let allInsights = [...parsedEmailInsights, ...parsedSmsInsights].sort((a, b) => {
      const dateA = new Date(a.dateReceived).getTime()
      const dateB = new Date(b.dateReceived).getTime()
      return dateB - dateA
    })

    // When third party is active, the DB query is paginated so allInsights only has one page.
    // We need a separate count query to get the real total.
    let overrideTotal: number | null = null
    // Only use overrideTotal for thirdParty — houseFileOnly includes SMS so we let allInsights handle the count normally
    if (thirdParty && thirdPartyCampaignIds !== null) {
      overrideTotal = await prisma.competitiveInsightCampaign.count({ where: emailWhere })
    }

    // For single message-type filters (email-only or sms-only) without donation platform,
    // use the dedicated count queries run in parallel above
    if (!shouldFetchAll && !fetchAllForCombining && overrideTotal === null) {
      if (effectiveMessageType === "email") {
        overrideTotal = emailCount
      } else if (effectiveMessageType === "sms") {
        overrideTotal = smsCount
      }
    }

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

    const totalCount = overrideTotal !== null ? overrideTotal : allInsights.length

    // When we have an overrideTotal (thirdParty case), allInsights is already paginated from DB
    const paginatedInsights = overrideTotal !== null ? allInsights : allInsights.slice(skip, skip + limit)

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
