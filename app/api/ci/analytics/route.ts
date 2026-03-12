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
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (fromDate) {
      dateFilter.gte = new Date(fromDate)
    } else {
      const defaultStart = new Date()
      defaultStart.setDate(defaultStart.getDate() - (chartDays + 6))
      defaultStart.setHours(0, 0, 0, 0)
      dateFilter.gte = defaultStart
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

    const includeEmails = !messageType || messageType === "all" || messageType === "email"
    const includeSMS = !messageType || messageType === "all" || messageType === "sms"

    const platformDomains: Record<string, string[]> = {
      winred: ["winred.com"],
      actblue: ["actblue.com"],
      anedot: ["anedot.com"],
      psq: ["psqimpact.com"],
      ngpvan: ["ngpvan.com"],
    }

    let emailCampaigns: { id: string; dateReceived: Date; inboxRate: number; inboxCount: number | null; spamCount: number | null; ctaLinks?: any; senderEmail?: string | null }[] = []
    if (includeEmails) {
      const rawEmailCampaigns = await prisma.competitiveInsightCampaign.findMany({
        where: {
          isDeleted: false,
          isHidden: false,
          ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
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
        },
      })

      // Apply platform filter client-side (ctaLinks is a JSON array)
      if (platform && platform !== "all") {
        const domains = platformDomains[platform] || []
        emailCampaigns = rawEmailCampaigns.filter((c) => {
          if (platform === "substack") {
            return c.senderEmail?.toLowerCase().endsWith("@substack.com") ?? false
          }
          const links: any[] = Array.isArray(c.ctaLinks) ? c.ctaLinks : []
          return links.some((link) => {
            const url = typeof link === "string" ? link : (link?.finalUrl || link?.url || "")
            return domains.some((d) => url.toLowerCase().includes(d))
          })
        })
      } else {
        emailCampaigns = rawEmailCampaigns
      }
    }

    let smsMessages: { id: string; createdAt: Date }[] = []
    if (includeSMS) {
      smsMessages = await prisma.smsQueue.findMany({
        where: {
          ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
          isDeleted: false,
          isHidden: false,
          ...(Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {}),
        },
        select: {
          id: true,
          createdAt: true,
        },
      })
    }

    if (emailCampaigns.length === 0 && smsMessages.length === 0) {
      return NextResponse.json(buildEmptyResponse())
    }

    // Unified date list for day-of-week / hour-of-day (both email + SMS)
    const allDates: { date: Date; type: "email" | "sms" }[] = [
      ...emailCampaigns.map((c) => ({ date: new Date(c.dateReceived), type: "email" as const })),
      ...smsMessages.map((s) => ({ date: new Date(s.createdAt), type: "sms" as const })),
    ]

    // --- Day of Week aggregation (local timezone) ---
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]
    allDates.forEach(({ date }) => {
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

    // --- Hour of Day aggregation (local timezone) ---
    const hourOfDayCounts = Array(24).fill(0)
    allDates.forEach(({ date }) => {
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

    // --- Volume over time with 7-day moving average ---
    const allTimestamps = allDates.map(({ date }) => date.getTime())
    const minDateKey = allDates.map(({ date }) => getLocalDateKey(date)).sort()[0]
    const maxDateKey = allDates.map(({ date }) => getLocalDateKey(date)).sort().at(-1)!

    const dailyMap = new Map<string, { emails: number; sms: number }>()
    const cursor = new Date(minDateKey + "T00:00:00")
    const endDate = new Date(maxDateKey + "T00:00:00")
    while (cursor <= endDate) {
      const key = cursor.toISOString().split("T")[0]
      dailyMap.set(key, { emails: 0, sms: 0 })
      cursor.setDate(cursor.getDate() + 1)
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
    // For each email: inboxRate >= 50 = inbox, < 50 = spam.
    // Get the total count of each, then compute %.
    const emailsWithPlacement = emailCampaigns.filter((c) => c.inboxRate != null && c.inboxRate > 0)
    const inboxedCount = emailsWithPlacement.filter((c) => c.inboxRate >= 50).length
    const spammedCount = emailsWithPlacement.length - inboxedCount
    const placementTotal = emailsWithPlacement.length
    const inboxPct = placementTotal > 0 ? Math.round((inboxedCount / placementTotal) * 100) : 0
    const spamPct = placementTotal > 0 ? 100 - inboxPct : 0

    const inboxingData =
      placementTotal > 0
        ? [
            { name: "Inbox", value: inboxPct },
            { name: "Spam", value: spamPct },
          ]
        : []

    const totalEmails = emailCampaigns.length
    const totalSMS = smsMessages.length

    // Trim volumeData to the requested chartDays window for display.
    // The extra 6 days fetched were only needed for moving average warm-up.
    const trimmedVolumeData = !fromDate ? volumeData.slice(-chartDays) : volumeData

    return NextResponse.json({
      totalEmails,
      totalSMS,
      mostActiveDay,
      mostActiveHour,
      dayOfWeekData,
      volumeData: trimmedVolumeData,
      inboxingData,
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
    volumeData: [],
    inboxingData: [],
    hasCampaigns: false,
  }
}
