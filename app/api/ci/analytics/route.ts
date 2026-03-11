import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

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
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined
    const messageType = searchParams.get("messageType") || undefined

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

    // Build date filters
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (fromDate) dateFilter.gte = new Date(fromDate)
    if (toDate) dateFilter.lte = new Date(toDate)

    // Build entity filter from sender slugs
    let entityIds: string[] | undefined
    if (senders.length > 0) {
      const entities = await prisma.ciEntity.findMany({
        where: { name: { in: senders } },
        select: { id: true },
      })
      entityIds = entities.map((e) => e.id)
      if (entityIds.length === 0) {
        return NextResponse.json(buildEmptyResponse())
      }
    }

    // CompetitiveInsightCampaign = emails only (no messageType field)
    // SmsQueue = SMS only, uses createdAt instead of dateReceived, no inboxRate
    const includeEmails = !messageType || messageType === "all" || messageType === "email"
    const includeSMS = !messageType || messageType === "all" || messageType === "sms"

    // Fetch email campaigns
    let emailCampaigns: { id: string; dateReceived: Date; inboxRate: number; inboxCount: number | null; spamCount: number | null }[] = []
    if (includeEmails) {
      emailCampaigns = await prisma.competitiveInsightCampaign.findMany({
        where: {
          clientId: targetClientId,
          ...(entityIds ? { entityId: { in: entityIds } } : {}),
          ...(party && party !== "all" ? { entity: { party } } : {}),
          ...(Object.keys(dateFilter).length > 0 ? { dateReceived: dateFilter } : {}),
          isDeleted: false,
          isHidden: false,
        },
        select: {
          id: true,
          dateReceived: true,
          inboxRate: true,
          inboxCount: true,
          spamCount: true,
        },
      })
    }

    // Fetch SMS messages separately
    let smsMessages: { id: string; createdAt: Date }[] = []
    if (includeSMS && entityIds) {
      smsMessages = await prisma.smsQueue.findMany({
        where: {
          entityId: { in: entityIds },
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

    // --- Day of Week aggregation ---
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]
    allDates.forEach(({ date }) => {
      dayOfWeekCounts[date.getDay()]++
    })
    const maxDayCount = Math.max(...dayOfWeekCounts, 1)
    const dayOfWeekData = dayOfWeekCounts.map((count, i) => ({
      day: dayNames[i],
      count,
      intensity: count / maxDayCount,
    }))

    const mostActiveDayIndex = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))
    const mostActiveDay = dayNames[mostActiveDayIndex]

    // --- Hour of Day aggregation ---
    const hourOfDayCounts = Array(24).fill(0)
    allDates.forEach(({ date }) => {
      hourOfDayCounts[date.getHours()]++
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
    const minDate = new Date(Math.min(...allTimestamps))
    const maxDate = new Date(Math.max(...allTimestamps))
    minDate.setHours(0, 0, 0, 0)
    maxDate.setHours(0, 0, 0, 0)

    const dailyMap = new Map<string, { emails: number; sms: number }>()
    const cursor = new Date(minDate)
    while (cursor <= maxDate) {
      dailyMap.set(cursor.toISOString().split("T")[0], { emails: 0, sms: 0 })
      cursor.setDate(cursor.getDate() + 1)
    }

    allDates.forEach(({ date, type }) => {
      const key = date.toISOString().split("T")[0]
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

    // --- Inboxing pie data (emails only — SMS has no seed test data) ---
    let totalInboxed = 0
    let totalSpam = 0
    emailCampaigns.forEach((c) => {
      totalInboxed += c.inboxCount ?? 0
      totalSpam += c.spamCount ?? 0
    })

    const grandTotal = totalInboxed + totalSpam
    const inboxPct = grandTotal > 0 ? Math.round((totalInboxed / grandTotal) * 100) : 0
    const spamPct = grandTotal > 0 ? 100 - inboxPct : 0

    const inboxingData =
      grandTotal > 0
        ? [
            { name: "Inbox", value: inboxPct, count: totalInboxed },
            { name: "Spam", value: spamPct, count: totalSpam },
          ]
        : []

    const totalEmails = emailCampaigns.length
    const totalSMS = smsMessages.length

    return NextResponse.json({
      totalEmails,
      totalSMS,
      mostActiveDay,
      mostActiveHour,
      dayOfWeekData,
      volumeData,
      inboxingData,
      hasCampaigns: campaigns.length > 0,
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
