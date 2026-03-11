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
        where: { slug: { in: senders } },
        select: { id: true },
      })
      entityIds = entities.map((e) => e.id)
      if (entityIds.length === 0) {
        return NextResponse.json(buildEmptyResponse())
      }
    }

    // Fetch ALL matching campaigns (no pagination) for analytics
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        clientId: targetClientId,
        ...(entityIds ? { entityId: { in: entityIds } } : {}),
        ...(party && party !== "all" ? { entity: { party } } : {}),
        ...(messageType && messageType !== "all" ? { messageType } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { dateReceived: dateFilter } : {}),
      },
      select: {
        id: true,
        dateReceived: true,
        messageType: true,
        inboxRate: true,
        inboxCount: true,
        spamCount: true,
      },
    })

    if (campaigns.length === 0) {
      return NextResponse.json(buildEmptyResponse())
    }

    // --- Day of Week aggregation ---
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
    const dayOfWeekCounts = [0, 0, 0, 0, 0, 0, 0]
    campaigns.forEach((c) => {
      const day = new Date(c.dateReceived).getDay()
      dayOfWeekCounts[day]++
    })
    const maxDayCount = Math.max(...dayOfWeekCounts, 1)
    const dayOfWeekData = dayOfWeekCounts.map((count, i) => ({
      day: dayNames[i],
      count,
      intensity: count / maxDayCount,
    }))

    // Most active day
    const mostActiveDayIndex = dayOfWeekCounts.indexOf(Math.max(...dayOfWeekCounts))
    const mostActiveDay = dayNames[mostActiveDayIndex]

    // --- Hour of Day aggregation ---
    const hourOfDayCounts = Array(24).fill(0)
    campaigns.forEach((c) => {
      const hour = new Date(c.dateReceived).getHours()
      hourOfDayCounts[hour]++
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
    const dailyMap = new Map<string, { emails: number; sms: number }>()

    // Initialize date range
    const dates = campaigns.map((c) => new Date(c.dateReceived).getTime())
    const minDate = new Date(Math.min(...dates))
    const maxDate = new Date(Math.max(...dates))
    minDate.setHours(0, 0, 0, 0)
    maxDate.setHours(0, 0, 0, 0)

    const cursor = new Date(minDate)
    while (cursor <= maxDate) {
      const key = cursor.toISOString().split("T")[0]
      dailyMap.set(key, { emails: 0, sms: 0 })
      cursor.setDate(cursor.getDate() + 1)
    }

    campaigns.forEach((c) => {
      const key = new Date(c.dateReceived).toISOString().split("T")[0]
      const entry = dailyMap.get(key)
      if (entry) {
        if (c.messageType === "sms") {
          entry.sms++
        } else {
          entry.emails++
        }
      }
    })

    const dailyArray = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }))

    // Compute 7-day moving averages
    const volumeData = dailyArray.map((day, index) => {
      const start = Math.max(0, index - 6)
      const window = dailyArray.slice(start, index + 1)
      const emailsAvg = Math.round((window.reduce((s, d) => s + d.emails, 0) / window.length) * 10) / 10
      const smsAvg = Math.round((window.reduce((s, d) => s + d.sms, 0) / window.length) * 10) / 10
      return { ...day, emailsAvg, smsAvg }
    })

    // --- Inboxing pie data ---
    let totalInboxed = 0
    let totalSpam = 0
    let totalWithData = 0
    campaigns.forEach((c) => {
      if (c.inboxCount != null || c.spamCount != null) {
        totalInboxed += c.inboxCount ?? 0
        totalSpam += c.spamCount ?? 0
        totalWithData++
      }
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

    const totalEmails = campaigns.filter((c) => c.messageType !== "sms").length
    const totalSMS = campaigns.filter((c) => c.messageType === "sms").length

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
