import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { normalizeSubject } from "@/lib/campaign-detector"
import { getEntityMappings } from "@/lib/ci-mapping-cache"

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
    const entityType = searchParams.get("entityType") || undefined
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
      const { mappingsByEntity } = await getEntityMappings()
      const entitiesWithMappings = new Set(Object.keys(mappingsByEntity))

      // Fetch email campaigns scoped to current filters to keep the ID list small
      const candidates = await prisma.competitiveInsightCampaign.findMany({
        where: {
          isDeleted: false,
          isHidden: authResult.user.role === "super_admin" ? undefined : false,
          entityId: { not: null },
          entity: {
            type: { not: "data_broker" },
            ...(senders.length > 0 && { name: { in: senders } }),
          },
          ...(dateFilter && { dateReceived: dateFilter }),
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
      const { mappingsByEntity } = await getEntityMappings()
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
      ...(thirdPartyCampaignIds !== null && { id: { in: thirdPartyCampaignIds } }),
      ...(houseFileCampaignIds !== null && { id: { in: houseFileCampaignIds } }),
    }

    // entityId filters: AND together subscriptionsOnly and tag filters if both active
    const entityIdSets: string[][] = []
    if (subscriptionsOnly && subscribedEntityIds.length > 0) entityIdSets.push(subscribedEntityIds)
    if (taggedEntityIds.length > 0) entityIdSets.push(taggedEntityIds)
    if (entityIdSets.length === 1) {
      emailWhere.entityId = { in: entityIdSets[0] }
    } else if (entityIdSets.length > 1) {
      // Intersect all sets so both constraints must be satisfied
      const intersection = entityIdSets[0].filter((id) => entityIdSets.every((set) => set.includes(id)))
      if (intersection.length === 0) {
        return NextResponse.json({ insights: [], pagination: { page, limit, total: 0, totalPages: 0 } })
      }
      emailWhere.entityId = { in: intersection }
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

    if (entityType && entityType !== "all") {
      emailWhere.entity = {
        ...emailWhere.entity,
        type: { equals: entityType, mode: "insensitive" },
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
    }

    // Apply same entityId intersection logic to smsWhere
    if (entityIdSets.length === 1) {
      smsWhere.entityId = { in: entityIdSets[0] }
    } else if (entityIdSets.length > 1) {
      const intersection = entityIdSets[0].filter((id) => entityIdSets.every((set) => set.includes(id)))
      smsWhere.entityId = intersection.length > 0 ? { in: intersection } : { in: [] }
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

    if (entityType && entityType !== "all") {
      smsWhere.entity = {
        ...smsWhere.entity,
        type: { equals: entityType, mode: "insensitive" },
      }
    }

    // Build SMS third-party / house-file ID sets using senderPhone mappings.
    // Also includes senderDomain values that are numeric-only (SMS short codes stored there).
    let thirdPartySmsIds: string[] | null = null
    let houseFileSmsIds: string[] | null = null
    if (thirdParty || houseFileOnly) {
      const { phonesByEntity } = await getEntityMappings()
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

    // donationPlatform is now handled DB-side via ctaLinks JSON filter where possible,
    // or as a post-filter on the small paginated result set (not 5000 rows).
    const shouldFetchAll = false
    const fetchAllForCombining = false

    // Shared entity select — no emailContent on list queries (huge payload savings)
    const entitySelect = {
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
    }

    try {
      if (effectiveMessageType === "all" || effectiveMessageType === "email" || !effectiveMessageType) {
        const emailQuery = {
          where: emailWhere,
          select: {
            id: true,
            senderName: true,
            senderEmail: true,
            subject: true,
            dateReceived: true,
            inboxRate: true,
            inboxCount: true,
            spamCount: true,
            notDeliveredCount: true,
            ctaLinks: true,
            emailPreview: true,
            // emailContent intentionally excluded from list query — fetched only on detail open
            bodyFingerprint: true,
            entityId: true,
            entity: entitySelect,
            clientId: true,
            source: true,
            isHidden: true,
            shareCount: true,
            shareViewCount: true,
            viewCount: true,
            shareToken: true,
            sendingProvider: true,
            unsubDomain: true,
            dkimSelector: true,
            sendingIp: true,
            donationPlatform: true,
          },
          orderBy: {
            dateReceived: "desc",
          } as const,
          skip,
          take: limit,
        }

        // Always run parallel count — never load 5000 rows just to count
        const [rows, count] = await Promise.all([
          prisma.competitiveInsightCampaign.findMany(emailQuery as any),
          prisma.competitiveInsightCampaign.count({ where: emailWhere }),
        ])
        emailInsights = rows
        emailCount = count

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
          select: {
            id: true,
            phoneNumber: true,
            toNumber: true,
            message: true,
            createdAt: true,
            ctaLinks: true,
            bodyFingerprint: true,
            entityId: true,
            entity: {
              select: {
                id: true,
                name: true,
                type: true,
                party: true,
                state: true,
                tags: {
                  where: { clientId: targetClientId },
                  select: { tagName: true, tagColor: true },
                },
              },
            },
            isHidden: true,
            clientId: true,
            source: true,
            shareCount: true,
            shareViewCount: true,
            viewCount: true,
            shareToken: true,
          },
          orderBy: { createdAt: "desc" } as const,
          skip,
          take: limit,
        }

        // Always parallel count — never load all rows to count
        const [rows, count] = await Promise.all([
          prisma.smsQueue.findMany(smsQuery as any),
          prisma.smsQueue.count({ where: smsWhere }),
        ])
        smsMessages = rows
        smsCount = count

      }
    } catch (dbError) {
      console.error("Database query error:", dbError)
      throw dbError
    }

    // ── Send-count helpers ──────────────────────────────────────────────────────
    // Both counts are computed via raw SQL on the DB side — no rows loaded into JS memory.

    // Subject count: count distinct send days per subject scoped to the same entity.
    const pageSubjects = emailInsights.map((i) => i.subject).filter(Boolean) as string[]
    const subjectStats = new Map<string, { count: number }>() // key: `${entityId}__${normalizedSubject}`
    if (pageSubjects.length > 0) {
      const rows = await prisma.$queryRawUnsafe<{ subject: string; entity_id: string | null; cnt: bigint }[]>(
        `SELECT subject, "entityId" AS entity_id, COUNT(DISTINCT DATE_TRUNC('hour', "dateReceived")) AS cnt
         FROM "CompetitiveInsightCampaign"
         WHERE subject = ANY($1::text[])
         GROUP BY subject, "entityId"`,
        pageSubjects
      )
      for (const row of rows) {
        const key = `${row.entity_id ?? ""}__${normalizeSubject(row.subject || "")}`
        if (!key) continue
        const existing = subjectStats.get(key)
        const n = Number(row.cnt)
        if (!existing || n > existing.count) subjectStats.set(key, { count: n })
      }
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

      const normalizedKey = `${insight.entityId ?? ""}__${normalizeSubject(insight.subject || "")}`
      const stats = subjectStats.get(normalizedKey)

      const bodySendCount = 1 // computed lazily via /api/competitive-insights/similar on detail open
      
      return {
        ...insight,
        type: "email" as const,
        ctaLinks,
        tags,
        clientId: insight.clientId,
        source: insight.source,
        sendCount: stats?.count ?? 1,
        bodySendCount,
      }
    })

    // SMS send count: count distinct days the same entity sent the same normalized message
    const smsPhoneNumbers = [...new Set(smsMessages.map((s) => s.phoneNumber).filter(Boolean))] as string[]
    const smsSendStats = new Map<string, number>() // key: `${entityId}__${normalizedMsg}` → day count
    if (smsPhoneNumbers.length > 0) {
      const smsCountRows = await prisma.$queryRawUnsafe<{ entity_id: string | null; normalized_msg: string; cnt: bigint }[]>(
        `SELECT "entityId" AS entity_id,
                LEFT(LOWER(REGEXP_REPLACE(message, 'https?://\\S+|\\$[\\d,]+(\\.[0-9]{2})?|\\b\\d{5,}\\b|[[:space:]]+', ' ', 'g')), 120) AS normalized_msg,
                COUNT(DISTINCT DATE_TRUNC('hour', "createdAt")) AS cnt
         FROM "SmsQueue"
         WHERE "phoneNumber" = ANY($1::text[])
           AND message IS NOT NULL
           AND "isDeleted" = false
         GROUP BY "entityId", normalized_msg`,
        smsPhoneNumbers
      )
      for (const row of smsCountRows) {
        const key = `${row.entity_id ?? ""}__${row.normalized_msg}`
        smsSendStats.set(key, Number(row.cnt))
      }
    }

    const parsedSmsInsights = smsMessages.map((sms) => {
      let ctaLinks = []
      
      try {
        ctaLinks = sms.ctaLinks ? JSON.parse(sms.ctaLinks) : []
      } catch (e) {
        console.error("[v0] Error parsing ctaLinks for SMS", sms.id, e)
        ctaLinks = []
      }

      const normalizedMsg = (sms.message || "")
        .toLowerCase()
        .replace(/https?:\/\/\S+|\$[\d,]+(\.\d{2})?|\b\d{5,}\b|\s+/g, " ")
        .substring(0, 120)
        .trim()
      const sendCount = smsSendStats.get(`${sms.entityId ?? ""}__${normalizedMsg}`) ?? 1
      
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
        bodyFingerprint: sms.bodyFingerprint || null,
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
        sendCount,
        shareToken: sms.shareToken || null,
      }
    })

    // Merge email + SMS results and sort by date (both sets are already one page each)
    let allInsights = [...parsedEmailInsights, ...parsedSmsInsights].sort((a, b) =>
      new Date(b.dateReceived).getTime() - new Date(a.dateReceived).getTime()
    )

    // donationPlatform post-filter runs on one page of results only — no longer 5000 rows
    if (donationPlatform && donationPlatform !== "all") {
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
            const urlsToCheck: string[] = []
            if (typeof link === "string") {
              urlsToCheck.push(link)
            } else {
              if (link.strippedFinalUrl) urlsToCheck.push(link.strippedFinalUrl)
              if (link.finalUrl) urlsToCheck.push(link.finalUrl)
              if (link.url) urlsToCheck.push(link.url)
            }
            return urlsToCheck.some((url) => domains.some((domain) => url.toLowerCase().includes(domain)))
          })
        })
      }
    }

    // Total count: use parallel count queries for each message type
    let totalCount: number
    if (effectiveMessageType === "email") {
      totalCount = emailCount
    } else if (effectiveMessageType === "sms") {
      totalCount = smsCount
    } else {
      // "all" — sum both counts
      totalCount = emailCount + smsCount
    }

    // When messageType==="all", both email and SMS each fetched up to `limit` rows.
    // After merging and sorting by date, slice back down to a single page of `limit`.
    const paginatedInsights = allInsights.slice(0, limit)

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
