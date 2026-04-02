import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get("clientSlug")
    const senders = searchParams.getAll("sender").filter(Boolean)
    const party = searchParams.get("party") || undefined
    const state = searchParams.get("state") || undefined
    const platform = searchParams.get("platform") || undefined
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined
    const messageType = searchParams.get("messageType") || undefined
    const timezone = searchParams.get("timezone") || "UTC"
    const chartDays = parseInt(searchParams.get("chartDays") || "7")

    // Compute timezone offset ONCE using Intl.DateTimeFormat, then apply as a simple
    // integer ms offset to every date — avoids expensive toLocaleString per record.
    const getTimezoneOffsetMs = (tz: string): number => {
      const now = new Date()
      const utcStr = now.toLocaleString("en-US", { timeZone: "UTC" })
      const localStr = now.toLocaleString("en-US", { timeZone: tz })
      return new Date(localStr).getTime() - new Date(utcStr).getTime()
    }
    const tzOffsetMs = getTimezoneOffsetMs(timezone)

    const toLocal = (date: Date) => new Date(date.getTime() + tzOffsetMs)

    const getLocalDay = (date: Date) => toLocal(date).getUTCDay()
    const getLocalHour = (date: Date) => toLocal(date).getUTCHours()
    const getLocalDateKey = (date: Date) => {
      const l = toLocal(date)
      return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, "0")}-${String(l.getUTCDate()).padStart(2, "0")}`
    }

    // Resolve clientId
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

    // Build date filters — fetch chartDays + 6 extra days so the 7-day moving average
    // has a full warm-up window. The response is then trimmed to chartDays for display.
    // IMPORTANT: Calculate date range in user's timezone to avoid UTC boundary issues.
    // E.g., 11pm EST on 3/31 = 4am UTC on 4/1. Without timezone-aware filtering,
    // those records would be excluded when filtering for "3/31 midnight to 4/1 midnight" in server time.
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (fromDate) {
      dateFilter.gte = new Date(fromDate)
    } else {
      // Calculate "today" in user's timezone, then subtract chartDays + 6
      const nowInUserTz = new Date(Date.now() + tzOffsetMs)
      // Get start of today in user's timezone (midnight), converted back to UTC for DB query
      const todayUserTzMidnight = new Date(Date.UTC(
        nowInUserTz.getUTCFullYear(),
        nowInUserTz.getUTCMonth(),
        nowInUserTz.getUTCDate(),
        0, 0, 0, 0
      ))
      // Convert back to UTC by subtracting the offset
      const todayMidnightUtc = new Date(todayUserTzMidnight.getTime() - tzOffsetMs)
      // Go back chartDays + 6 days
      todayMidnightUtc.setDate(todayMidnightUtc.getDate() - (chartDays + 6))
      dateFilter.gte = todayMidnightUtc
    }
    if (toDate) dateFilter.lte = new Date(toDate)

    // Reporting shows ALL entities by default — no subscription scoping.
    // Only narrow entityIds when the user explicitly selects a filter.
    const hasEntityFilter = senders.length > 0
    const hasPartyFilter = party && party !== "all"
    const hasStateFilter = state && state !== "all"

    let entityIdFilter: { in: string[] } | undefined = undefined

    if (hasEntityFilter || hasPartyFilter || hasStateFilter) {
      const entityWhere: any = {}
      if (hasEntityFilter) entityWhere.name = { in: senders, mode: "insensitive" }
      if (hasPartyFilter) entityWhere.party = { equals: party, mode: "insensitive" }
      if (hasStateFilter) entityWhere.state = { equals: state, mode: "insensitive" }

      const matchedEntities = await prisma.ciEntity.findMany({
        where: entityWhere,
        select: { id: true },
      })
      const ids = matchedEntities.map((e) => e.id)
      if (ids.length === 0) return NextResponse.json(buildEmptyResponse())
      entityIdFilter = { in: ids }
    }

    const isThirdPartyFilter = messageType === "third_party"
    const isHouseFileFilter = messageType === "house_file_only"
    const hasPlatformFilter = platform && platform !== "all"
    const includeEmails = !messageType || messageType === "all" || messageType === "email" || isThirdPartyFilter || isHouseFileFilter
    // Substack is email-only — exclude SMS when Substack platform is selected
    const includeSMS = (!messageType || messageType === "all" || messageType === "sms" || isThirdPartyFilter || isHouseFileFilter) && platform !== "substack"

    // Build third-party / house-file ID sets for both emails and SMS.
    let thirdPartyOrHouseFileCampaignIds: string[] | null = null
    let thirdPartyOrHouseFileSmsIds: string[] | null = null
    if (isThirdPartyFilter || isHouseFileFilter) {
      const [allMappings, allEntities, phoneMappings] = await Promise.all([
        prisma.ciEntityMapping.findMany({
          select: { entityId: true, senderEmail: true, senderDomain: true },
        }),
        prisma.ciEntity.findMany({ select: { id: true, donationIdentifiers: true } }),
        prisma.ciEntityMapping.findMany({
          where: {
            OR: [
              { senderPhone: { not: null } },
              // Short codes are stored as numeric-only senderDomain values
              { senderDomain: { not: null } },
            ],
          },
          select: { entityId: true, senderPhone: true, senderDomain: true },
        }),
      ])

      // Email/domain mappings
      const mappingsByEntity: Record<string, { emails: Set<string>; domains: Set<string> }> = {}
      for (const m of allMappings) {
        if (!mappingsByEntity[m.entityId]) mappingsByEntity[m.entityId] = { emails: new Set(), domains: new Set() }
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

      // Phone mappings — includes numeric-only senderDomain values (SMS short codes)
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

      // Email candidates
      const emailCandidates = await prisma.competitiveInsightCampaign.findMany({
        where: {
          isDeleted: false,
          isHidden: false,
          ...(isThirdPartyFilter ? { entityId: { in: [...entitiesWithMappings] } } : { entityId: { not: null } }),
          ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
        },
        select: { id: true, entityId: true, senderEmail: true },
      })

      thirdPartyOrHouseFileCampaignIds = emailCandidates
        .filter((c) => {
          if (!c.entityId) return !isThirdPartyFilter
          const em = mappingsByEntity[c.entityId]
          if (!em) return isHouseFileFilter
          const email = (c.senderEmail ?? "").toLowerCase()
          const domain = email.split("@")[1]
          const isThirdParty = !em.emails.has(email) && (!domain || !em.domains.has(domain))
          return isThirdPartyFilter ? isThirdParty : !isThirdParty
        })
        .map((c) => c.id)

      // SMS candidates
      const smsCandidates = await prisma.smsQueue.findMany({
        where: {
          isDeleted: false,
          isHidden: false,
          entityId: { not: null },
          ...(isThirdPartyFilter ? { entityId: { in: [...entitiesWithPhoneMappings] } } : {}),
          ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
        },
        select: { id: true, entityId: true, phoneNumber: true },
      })

      thirdPartyOrHouseFileSmsIds = smsCandidates
        .filter((s) => {
          if (!s.entityId) return !isThirdPartyFilter
          const phones = phonesByEntity[s.entityId]
          if (!phones) return isHouseFileFilter
          const isThirdParty = !phones.has(s.phoneNumber ?? "")
          return isThirdPartyFilter ? isThirdParty : !isThirdParty
        })
        .map((s) => s.id)
    }

    const platformDomains: Record<string, string[]> = {
      winred: ["winred.com"],
      actblue: ["actblue.com"],
      anedot: ["anedot.com"],
      psq: ["psqimpact.com"],
      ngpvan: ["ngpvan.com"],
    }

    let emailCampaigns: { id: string; dateReceived: Date; inboxRate: number; inboxCount: number | null; spamCount: number | null; ctaLinks?: any; senderEmail?: string | null; entityId?: string | null; entityParty?: string | null }[] = []
    if (includeEmails) {
      const rawEmailCampaigns = await prisma.competitiveInsightCampaign.findMany({
        where: {
          isDeleted: false,
          isHidden: false,
          ...(entityIdFilter && !isThirdPartyFilter && !isHouseFileFilter ? { entityId: entityIdFilter } : {}),
          ...(thirdPartyOrHouseFileCampaignIds !== null ? { id: { in: thirdPartyOrHouseFileCampaignIds } } : {}),
          ...(Object.keys(dateFilter).length > 0 ? { dateReceived: dateFilter } : {}),
        },
        select: {
          id: true,
          dateReceived: true,
          inboxRate: true,
          inboxCount: true,
          spamCount: true,
          ctaLinks: true,
          senderEmail: true,
          entityId: true,
          entity: { select: { party: true } },
        },
      })

      // Apply platform filter client-side (ctaLinks is a JSON array)
      const mappedRaw = rawEmailCampaigns.map((c: any) => ({ ...c, entityParty: c.entity?.party ?? null }))
      if (platform && platform !== "all") {
        const domains = platformDomains[platform] || []
        emailCampaigns = mappedRaw.filter((c: any) => {
          if (platform === "substack") {
            return c.senderEmail?.toLowerCase().endsWith("@substack.com") ?? false
          }
          let links: any[] = []
          if (Array.isArray(c.ctaLinks)) {
            links = c.ctaLinks
          } else if (typeof c.ctaLinks === "string") {
            try { links = JSON.parse(c.ctaLinks) } catch { links = [] }
          }
          return links.some((link: any) => {
            const url = typeof link === "string" ? link : (link?.finalUrl || link?.url || "")
            return domains.some((d) => url.toLowerCase().includes(d))
          })
        })
      } else {
        emailCampaigns = mappedRaw
      }
    }

    let smsMessages: { id: string; createdAt: Date }[] = []
    if (includeSMS) {
      const rawSmsMessages = await prisma.smsQueue.findMany({
        where: {
          ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
          isDeleted: false,
          isHidden: false,
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
          ...(thirdPartyOrHouseFileSmsIds !== null ? { id: { in: thirdPartyOrHouseFileSmsIds } } : {}),
        },
        select: {
          id: true,
          createdAt: true,
          ...(hasPlatformFilter ? { ctaLinks: true } : {}),
        },
      })

      // Apply platform filter to SMS via ctaLinks finalUrl domain matching
      if (hasPlatformFilter && platform !== "substack") {
        const domains = platformDomains[platform!] || []
        smsMessages = (rawSmsMessages as any[]).filter((s) => {
          // Prisma JSON fields may come back as a parsed array, a raw string, or null
          let links: any[] = []
          if (Array.isArray(s.ctaLinks)) {
            links = s.ctaLinks
          } else if (typeof s.ctaLinks === "string") {
            try { links = JSON.parse(s.ctaLinks) } catch { links = [] }
          }
          return links.some((link: any) => {
            const url = typeof link === "string" ? link : (link?.finalUrl || link?.url || "")
            return domains.some((d: string) => url.toLowerCase().includes(d))
          })
        })

      } else {
        smsMessages = rawSmsMessages
      }
    }

    if (emailCampaigns.length === 0 && smsMessages.length === 0) {
      return NextResponse.json(buildEmptyResponse())
    }

    // Unified date list for volume chart (includes warm-up records for moving average)
    const allDates: { date: Date; type: "email" | "sms" }[] = [
      ...emailCampaigns.map((c) => ({ date: new Date(c.dateReceived), type: "email" as const })),
      ...smsMessages.map((s) => ({ date: new Date(s.createdAt), type: "sms" as const })),
    ]

    // For day-of-week and hour-of-day, only count records within the actual display window
    // (not the 6 warm-up days). This ensures stats match what's shown on the chart.
    // Calculate in user's timezone to match the DB query filter.
    const displayWindowStart = fromDate
      ? new Date(fromDate)
      : (() => {
          const nowInUserTz = new Date(Date.now() + tzOffsetMs)
          const todayUserTzMidnight = new Date(Date.UTC(
            nowInUserTz.getUTCFullYear(),
            nowInUserTz.getUTCMonth(),
            nowInUserTz.getUTCDate(),
            0, 0, 0, 0
          ))
          const todayMidnightUtc = new Date(todayUserTzMidnight.getTime() - tzOffsetMs)
          todayMidnightUtc.setDate(todayMidnightUtc.getDate() - chartDays)
          return todayMidnightUtc
        })()
    const displayDates = allDates.filter(({ date }) => date >= displayWindowStart)

    // --- Day of Week aggregation (local timezone, display window only) ---
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]
    displayDates.forEach(({ date }) => {
      dayOfWeekCounts[getLocalDay(date)]++
    })
    const maxDayCount = Math.max(...dayOfWeekCounts, 1)
    const dayOfWeekData = dayOfWeekCounts.map((count, i) => ({
      day: dayNames[i],
      count,
      intensity: count / maxDayCount,
    }))

    const mostActiveDayIndex = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))
    const mostActiveDay = dayNames[mostActiveDayIndex]

    // --- Hour of Day aggregation (local timezone, display window only) ---
    const hourOfDayCounts = Array(24).fill(0)
    displayDates.forEach(({ date }) => {
      hourOfDayCounts[getLocalHour(date)]++
    })
    const mostActiveHourIndex = hourOfDayCounts.indexOf(Math.max(...hourOfDayCounts))
    const formatHour = (h: number) => {
      const period = h >= 12 ? "PM" : "AM"
      const display = h % 12 === 0 ? 12 : h % 12
      const next = (h + 1) % 24
      const nextPeriod = next >= 12 ? "PM" : "AM"
      const nextDisplay = next % 12 === 0 ? 12 : next % 12
      return `${display}–${nextDisplay} ${period === nextPeriod ? period : period + "/" + nextPeriod}`
    }
    const mostActiveHour = formatHour(mostActiveHourIndex)
    const maxHourCount = Math.max(...hourOfDayCounts, 1)
    const hourOfDayData = hourOfDayCounts.map((count, h) => ({
      hour: h,
      label: formatHour(h),
      count,
      intensity: count / maxHourCount,
    }))

    // --- Volume over time with 7-day moving average ---
    const allTimestamps = allDates.map(({ date }) => date.getTime())
    const allLocalDateKeys = allDates.map(({ date }) => getLocalDateKey(date)).sort()
    const minDateKey = allLocalDateKeys[0]
    const maxDateKey = allLocalDateKeys.at(-1)!

    const dailyMap = new Map<string, { emails: number; sms: number }>()
    // Generate all date keys between min and max using simple string-based date math
    // to avoid timezone conversion issues with Date objects
    const [minYear, minMonth, minDay] = minDateKey.split("-").map(Number)
    const [maxYear, maxMonth, maxDay] = maxDateKey.split("-").map(Number)
    const minDateNum = new Date(Date.UTC(minYear, minMonth - 1, minDay))
    const maxDateNum = new Date(Date.UTC(maxYear, maxMonth - 1, maxDay))
    const cursor = new Date(minDateNum)
    while (cursor <= maxDateNum) {
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}-${String(cursor.getUTCDate()).padStart(2, "0")}`
      dailyMap.set(key, { emails: 0, sms: 0 })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    allDates.forEach(({ date, type }) => {
      const key = getLocalDateKey(date)
      const entry = dailyMap.get(key)
      if (entry) {
        if (type === "sms") entry.sms++
        else entry.emails++
      }
    })

    const dailyArray = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }))

    const volumeData = dailyArray.map((day, index) => {
      const start = Math.max(0, index - 6)
      const windowSlice = dailyArray.slice(start, index + 1)
      const emailsAvg = Math.round((windowSlice.reduce((s, d) => s + d.emails, 0) / windowSlice.length) * 10) / 10
      const smsAvg = Math.round((windowSlice.reduce((s, d) => s + d.sms, 0) / windowSlice.length) * 10) / 10
      return { ...day, emailsAvg, smsAvg }
    })

    // --- Inboxing pie data ---
    // Sum inboxCount and spamCount across all campaigns that have placement data,
    // then divide totalInbox / (totalInbox + totalSpam) for an accurate inbox rate.
    const emailsWithPlacement = emailCampaigns.filter(
      (c) => (c.inboxCount != null && c.inboxCount > 0) || (c.spamCount != null && c.spamCount > 0)
    )
    const totalInboxCount = emailsWithPlacement.reduce((sum, c) => sum + (c.inboxCount ?? 0), 0)
    const totalSpamCount = emailsWithPlacement.reduce((sum, c) => sum + (c.spamCount ?? 0), 0)
    const placementTotal = totalInboxCount + totalSpamCount
    const inboxPct = placementTotal > 0 ? Math.round((totalInboxCount / placementTotal) * 100) : 0
    const spamPct = placementTotal > 0 ? 100 - inboxPct : 0

    const inboxingData =
      placementTotal > 0
        ? [
            { name: "Inbox", value: inboxPct },
            { name: "Spam", value: spamPct },
          ]
        : []

    // --- Inboxing over time (daily inbox rate & spam rate with 7-day moving average) ---
    // Build a daily map covering the same date range as volumeData
    const inboxDailyMap = new Map<string, { inboxCount: number; spamCount: number }>()
    const inboxCursor = new Date(minDateKey + "T00:00:00")
    const inboxEndDate = new Date(maxDateKey + "T00:00:00")
    while (inboxCursor <= inboxEndDate) {
      const key = inboxCursor.toISOString().split("T")[0]
      inboxDailyMap.set(key, { inboxCount: 0, spamCount: 0 })
      inboxCursor.setDate(inboxCursor.getDate() + 1)
    }

    for (const c of emailsWithPlacement) {
      const key = getLocalDateKey(new Date(c.dateReceived))
      const entry = inboxDailyMap.get(key)
      if (entry) {
        entry.inboxCount += c.inboxCount ?? 0
        entry.spamCount += c.spamCount ?? 0
      }
    }

    const inboxDailyArray = Array.from(inboxDailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => {
        const total = counts.inboxCount + counts.spamCount
        const inboxRate = total > 0 ? Math.round((counts.inboxCount / total) * 1000) / 10 : null
        const spamRate = total > 0 ? Math.round((counts.spamCount / total) * 1000) / 10 : null
        return { date, inboxRate, spamRate, total }
      })

    // Compute 7-day moving average for inbox/spam rate (only over days with data)
    const inboxingTimeData = inboxDailyArray.map((day, index) => {
      const start = Math.max(0, index - 6)
      const windowWithData = inboxDailyArray.slice(start, index + 1).filter((d) => d.total > 0)
      const inboxAvg =
        windowWithData.length > 0
          ? Math.round((windowWithData.reduce((s, d) => s + (d.inboxRate ?? 0), 0) / windowWithData.length) * 10) / 10
          : null
      const spamAvg =
        windowWithData.length > 0
          ? Math.round((windowWithData.reduce((s, d) => s + (d.spamRate ?? 0), 0) / windowWithData.length) * 10) / 10
          : null
      return {
        date: day.date,
        inboxRate: day.inboxRate,
        spamRate: day.spamRate,
        inboxAvg,
        spamAvg,
      }
    })

    // --- Inbox Rate by Party over time ---
    const PARTIES = ["republican", "democrat"] as const
    type Party = typeof PARTIES[number]

    const partyDailyMap = new Map<string, Record<Party, { inboxCount: number; spamCount: number }>>()
    const partyCursor = new Date(minDateKey + "T00:00:00")
    const partyEndDate = new Date(maxDateKey + "T00:00:00")
    while (partyCursor <= partyEndDate) {
      const key = partyCursor.toISOString().split("T")[0]
      partyDailyMap.set(key, {
        republican: { inboxCount: 0, spamCount: 0 },
        democrat: { inboxCount: 0, spamCount: 0 },
      })
      partyCursor.setDate(partyCursor.getDate() + 1)
    }

    for (const c of emailsWithPlacement) {
      const p = (c.entityParty ?? "").toLowerCase() as Party
      if (!PARTIES.includes(p)) continue
      const key = getLocalDateKey(new Date(c.dateReceived))
      const entry = partyDailyMap.get(key)
      if (entry) {
        entry[p].inboxCount += c.inboxCount ?? 0
        entry[p].spamCount += c.spamCount ?? 0
      }
    }

    const partyDailyArray = Array.from(partyDailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, parties]) => {
        const rTotal = parties.republican.inboxCount + parties.republican.spamCount
        const dTotal = parties.democrat.inboxCount + parties.democrat.spamCount
        return {
          date,
          repInboxRate: rTotal > 0 ? Math.round((parties.republican.inboxCount / rTotal) * 1000) / 10 : null,
          repSpamRate: rTotal > 0 ? Math.round((parties.republican.spamCount / rTotal) * 1000) / 10 : null,
          demInboxRate: dTotal > 0 ? Math.round((parties.democrat.inboxCount / dTotal) * 1000) / 10 : null,
          demSpamRate: dTotal > 0 ? Math.round((parties.democrat.spamCount / dTotal) * 1000) / 10 : null,
          rTotal,
          dTotal,
        }
      })

    const inboxingByPartyData = partyDailyArray.map((day, index) => {
      const start = Math.max(0, index - 6)
      const window = partyDailyArray.slice(start, index + 1)
      const repWindow = window.filter((d) => d.rTotal > 0)
      const demWindow = window.filter((d) => d.dTotal > 0)
      return {
        date: day.date,
        repInboxRate: day.repInboxRate,
        repSpamRate: day.repSpamRate,
        demInboxRate: day.demInboxRate,
        demSpamRate: day.demSpamRate,
        repInboxAvg: repWindow.length > 0 ? Math.round((repWindow.reduce((s, d) => s + (d.repInboxRate ?? 0), 0) / repWindow.length) * 10) / 10 : null,
        repSpamAvg: repWindow.length > 0 ? Math.round((repWindow.reduce((s, d) => s + (d.repSpamRate ?? 0), 0) / repWindow.length) * 10) / 10 : null,
        demInboxAvg: demWindow.length > 0 ? Math.round((demWindow.reduce((s, d) => s + (d.demInboxRate ?? 0), 0) / demWindow.length) * 10) / 10 : null,
        demSpamAvg: demWindow.length > 0 ? Math.round((demWindow.reduce((s, d) => s + (d.demSpamRate ?? 0), 0) / demWindow.length) * 10) / 10 : null,
      }
    })

    const trimmedInboxingByPartyData = !fromDate ? inboxingByPartyData.slice(-chartDays) : inboxingByPartyData

    // --- Inbox Rate by Platform over time ---
    const INBOXING_PLATFORMS = ["winred", "actblue", "anedot", "psq"] as const
    type InboxingPlatform = typeof INBOXING_PLATFORMS[number]
    const inboxingPlatformDomains: Record<InboxingPlatform, string[]> = {
      winred: ["winred.com"],
      actblue: ["actblue.com"],
      anedot: ["anedot.com"],
      psq: ["psqimpact.com", "politicalsurveyquestions.com", "psqsurveys.com"],
    }

    // Helper: detect which platforms a campaign links to (can match multiple)
    const getCampaignPlatforms = (c: { ctaLinks?: any }): InboxingPlatform[] => {
      let links: any[] = []
      if (Array.isArray(c.ctaLinks)) {
        links = c.ctaLinks
      } else if (typeof c.ctaLinks === "string") {
        try { links = JSON.parse(c.ctaLinks) } catch { links = [] }
      }
      const matched = new Set<InboxingPlatform>()
      for (const link of links) {
        const url = ((typeof link === "string" ? link : (link?.finalUrl || link?.url || "")) as string).toLowerCase()
        for (const platform of INBOXING_PLATFORMS) {
          if (inboxingPlatformDomains[platform].some((d) => url.includes(d))) {
            matched.add(platform)
          }
        }
      }
      return Array.from(matched)
    }

    // Build daily map per platform
    const platformDailyMap = new Map<string, Record<InboxingPlatform, { inboxCount: number; spamCount: number }>>()
    const platformCursor = new Date(minDateKey + "T00:00:00")
    const platformEndDate = new Date(maxDateKey + "T00:00:00")
    while (platformCursor <= platformEndDate) {
      const key = platformCursor.toISOString().split("T")[0]
      platformDailyMap.set(key, {
        winred: { inboxCount: 0, spamCount: 0 },
        actblue: { inboxCount: 0, spamCount: 0 },
        anedot: { inboxCount: 0, spamCount: 0 },
        psq: { inboxCount: 0, spamCount: 0 },
      })
      platformCursor.setDate(platformCursor.getDate() + 1)
    }

    // Aggregate totals per platform for debug
    const platformTotals: Record<string, { inbox: number; spam: number; campaigns: number }> = {
      winred: { inbox: 0, spam: 0, campaigns: 0 },
      actblue: { inbox: 0, spam: 0, campaigns: 0 },
      anedot: { inbox: 0, spam: 0, campaigns: 0 },
      psq: { inbox: 0, spam: 0, campaigns: 0 },
    }
    for (const c of emailsWithPlacement) {
      const platforms = getCampaignPlatforms(c)
      if (platforms.length === 0) continue
      const key = getLocalDateKey(new Date(c.dateReceived))
      const entry = platformDailyMap.get(key)
      if (!entry) continue
      // Attribute inbox/spam counts to each matched platform
      for (const p of platforms) {
        entry[p].inboxCount += c.inboxCount ?? 0
        entry[p].spamCount += c.spamCount ?? 0
        platformTotals[p].inbox += c.inboxCount ?? 0
        platformTotals[p].spam += c.spamCount ?? 0
        platformTotals[p].campaigns++
      }
    }
    for (const p of INBOXING_PLATFORMS) {
      const t = platformTotals[p]
      const total = t.inbox + t.spam
      console.log(`[v0] Platform ${p}: campaigns=${t.campaigns} inbox=${t.inbox} spam=${t.spam} rate=${total > 0 ? Math.round(t.inbox / total * 100) : "N/A"}%`)
    }

    const platformDailyArray = Array.from(platformDailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, plats]) => {
        const row: Record<string, string | number | null> = { date }
        for (const p of INBOXING_PLATFORMS) {
          const total = plats[p].inboxCount + plats[p].spamCount
          row[`${p}InboxRate`] = total > 0 ? Math.round((plats[p].inboxCount / total) * 1000) / 10 : null
          row[`${p}Total`] = total
        }
        return row
      })

    const inboxingByPlatformData = platformDailyArray.map((day, index) => {
      const start = Math.max(0, index - 6)
      const window = platformDailyArray.slice(start, index + 1)
      const row: Record<string, string | number | null> = { date: day.date }
      for (const p of INBOXING_PLATFORMS) {
        row[`${p}InboxRate`] = day[`${p}InboxRate`]
        const w = window.filter((d) => (d[`${p}Total`] as number) > 0)
        row[`${p}InboxAvg`] = w.length > 0
          ? Math.round((w.reduce((s, d) => s + ((d[`${p}InboxRate`] as number) ?? 0), 0) / w.length) * 10) / 10
          : null
      }
      return row
    })

    const trimmedInboxingByPlatformData = !fromDate ? inboxingByPlatformData.slice(-chartDays) : inboxingByPlatformData

    // --- House file vs Third-party inbox rate over time ---
    // Fetch all entity email/domain mappings unconditionally
    const allMappingsForChart = await prisma.ciEntityMapping.findMany({
      select: { entityId: true, senderEmail: true, senderDomain: true },
    })
    const mappingsByEntityForChart: Record<string, { emails: Set<string>; domains: Set<string> }> = {}
    for (const m of allMappingsForChart) {
      if (!mappingsByEntityForChart[m.entityId]) mappingsByEntityForChart[m.entityId] = { emails: new Set(), domains: new Set() }
      if (m.senderEmail) mappingsByEntityForChart[m.entityId].emails.add(m.senderEmail.toLowerCase())
      if (m.senderDomain) mappingsByEntityForChart[m.entityId].domains.add(m.senderDomain.toLowerCase())
    }

    const isThirdPartyCampaign = (c: { entityId?: string | null; senderEmail?: string | null }): boolean | null => {
      if (!c.entityId) return null // can't classify
      const em = mappingsByEntityForChart[c.entityId]
      if (!em) return null // entity has no mappings — can't classify
      const email = (c.senderEmail ?? "").toLowerCase()
      const domain = email.split("@")[1]
      return !em.emails.has(email) && (!domain || !em.domains.has(domain))
    }

    // Build daily map
    type HFType = "houseFile" | "thirdParty"
    const hfDailyMap = new Map<string, Record<HFType, { inboxCount: number; spamCount: number }>>()
    const hfCursor = new Date(minDateKey + "T00:00:00")
    const hfEndDate = new Date(maxDateKey + "T00:00:00")
    while (hfCursor <= hfEndDate) {
      const key = hfCursor.toISOString().split("T")[0]
      hfDailyMap.set(key, {
        houseFile: { inboxCount: 0, spamCount: 0 },
        thirdParty: { inboxCount: 0, spamCount: 0 },
      })
      hfCursor.setDate(hfCursor.getDate() + 1)
    }

    for (const c of emailsWithPlacement) {
      const tp = isThirdPartyCampaign(c)
      if (tp === null) continue
      const bucket: HFType = tp ? "thirdParty" : "houseFile"
      const key = getLocalDateKey(new Date(c.dateReceived))
      const entry = hfDailyMap.get(key)
      if (!entry) continue
      entry[bucket].inboxCount += c.inboxCount ?? 0
      entry[bucket].spamCount += c.spamCount ?? 0
    }

    const hfDailyArray = Array.from(hfDailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, buckets]) => {
        const hfTotal = buckets.houseFile.inboxCount + buckets.houseFile.spamCount
        const tpTotal = buckets.thirdParty.inboxCount + buckets.thirdParty.spamCount
        return {
          date,
          houseFileInboxRate: hfTotal > 0 ? Math.round((buckets.houseFile.inboxCount / hfTotal) * 1000) / 10 : null,
          thirdPartyInboxRate: tpTotal > 0 ? Math.round((buckets.thirdParty.inboxCount / tpTotal) * 1000) / 10 : null,
          hfTotal,
          tpTotal,
        }
      })

    const inboxingByFileTypeData = hfDailyArray.map((day, index) => {
      const start = Math.max(0, index - 6)
      const window = hfDailyArray.slice(start, index + 1)
      const hfWindow = window.filter((d) => d.hfTotal > 0)
      const tpWindow = window.filter((d) => d.tpTotal > 0)
      return {
        date: day.date,
        houseFileInboxRate: day.houseFileInboxRate,
        thirdPartyInboxRate: day.thirdPartyInboxRate,
        houseFileAvg: hfWindow.length > 0 ? Math.round((hfWindow.reduce((s, d) => s + (d.houseFileInboxRate ?? 0), 0) / hfWindow.length) * 10) / 10 : null,
        thirdPartyAvg: tpWindow.length > 0 ? Math.round((tpWindow.reduce((s, d) => s + (d.thirdPartyInboxRate ?? 0), 0) / tpWindow.length) * 10) / 10 : null,
      }
    })

    const trimmedInboxingByFileTypeData = !fromDate ? inboxingByFileTypeData.slice(-chartDays) : inboxingByFileTypeData

    const totalEmails = emailCampaigns.length
    const totalSMS = smsMessages.length

    // Trim volumeData to the requested chartDays window for display.
    // The extra 6 days fetched were only needed for moving average warm-up.
    // Important: trim by date, not array index, to ensure we get the correct calendar days.
    const displayWindowDateStart = fromDate
      ? new Date(fromDate)
      : (() => {
          const nowInUserTz = new Date(Date.now() + tzOffsetMs)
          const todayUserTzMidnight = new Date(Date.UTC(
            nowInUserTz.getUTCFullYear(),
            nowInUserTz.getUTCMonth(),
            nowInUserTz.getUTCDate(),
            0, 0, 0, 0
          ))
          const todayMidnightUtc = new Date(todayUserTzMidnight.getTime() - tzOffsetMs)
          todayMidnightUtc.setDate(todayMidnightUtc.getDate() - chartDays + 1)
          return todayMidnightUtc
        })()
    const displayWindowDateStartStr = displayWindowDateStart.toISOString().split("T")[0]
    const trimmedVolumeData = volumeData.filter(d => d.date >= displayWindowDateStartStr)

    const trimmedInboxingTimeData = inboxingTimeData.filter(d => d.date >= displayWindowDateStartStr)

    return NextResponse.json({
      totalEmails,
      totalSMS,
      mostActiveDay,
      mostActiveHour,
      dayOfWeekData,
      hourOfDayData,
      volumeData: trimmedVolumeData,
      inboxingData,
      inboxingTimeData: trimmedInboxingTimeData,
      inboxingByPartyData: trimmedInboxingByPartyData,
      inboxingByPlatformData: trimmedInboxingByPlatformData,
      inboxingByFileTypeData: trimmedInboxingByFileTypeData,
      hasCampaigns: totalEmails > 0 || totalSMS > 0,
    })
  } catch (error) {
    console.error("[ci/analytics] Error:", error)
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 })
  }
}

function buildEmptyResponse() {
  return {
    totalEmails: 0,
    totalSMS: 0,
    mostActiveDay: null,
    mostActiveHour: null,
    dayOfWeekData: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((day) => ({
      day,
      count: 0,
      intensity: 0,
    })),
    hourOfDayData: Array.from({ length: 24 }, (_, h) => ({ hour: h, label: "", count: 0, intensity: 0 })),
    volumeData: [],
    inboxingData: [],
    inboxingTimeData: [],
    inboxingByPartyData: [],
    inboxingByPlatformData: [],
    inboxingByFileTypeData: [],
    hasCampaigns: false,
  }
}
