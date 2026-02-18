import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { isAdmin } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    // Check if user is admin
    const isUserAdmin = await isAdmin(request)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")
    const daysParam = searchParams.get("days")

    // Default to last 30 days if no params provided
    const days = daysParam ? parseInt(daysParam) : 30
    const endDate = endDateParam ? new Date(endDateParam) : new Date()
    const startDate = startDateParam ? new Date(startDateParam) : new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000)

    // Set time boundaries
    startDate.setHours(0, 0, 0, 0)
    endDate.setHours(23, 59, 59, 999)

    // Get all emails in range
    const emails = await prisma.competitiveInsightCampaign.findMany({
      where: {
        dateReceived: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        dateReceived: true,
      },
    })

    // Get all SMS in range
    const smsMessages = await prisma.smsQueue.findMany({
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        createdAt: true,
      },
    })

    // Group by day
    const dailyStats = new Map<string, { date: string; emails: number; sms: number }>()

    // Initialize all days in range with zero counts
    const currentDate = new Date(startDate)
    while (currentDate <= endDate) {
      const dateKey = currentDate.toISOString().split("T")[0]
      dailyStats.set(dateKey, { date: dateKey, emails: 0, sms: 0 })
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Count emails per day
    emails.forEach((email) => {
      const dateKey = email.dateReceived.toISOString().split("T")[0]
      const stats = dailyStats.get(dateKey)
      if (stats) {
        stats.emails++
      }
    })

    // Count SMS per day
    smsMessages.forEach((sms) => {
      const dateKey = sms.createdAt.toISOString().split("T")[0]
      const stats = dailyStats.get(dateKey)
      if (stats) {
        stats.sms++
      }
    })

    // Convert to array and sort by date
    const dailyData = Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date))

    // Calculate 7-day moving averages
    const dataWithMovingAvg = dailyData.map((day, index) => {
      // Get the last 7 days including current day
      const start = Math.max(0, index - 6)
      const window = dailyData.slice(start, index + 1)

      const emailsAvg = window.reduce((sum, d) => sum + d.emails, 0) / window.length
      const smsAvg = window.reduce((sum, d) => sum + d.sms, 0) / window.length

      return {
        date: day.date,
        emails: day.emails,
        sms: day.sms,
        total: day.emails + day.sms,
        emailsAvg: Math.round(emailsAvg * 10) / 10, // Round to 1 decimal
        smsAvg: Math.round(smsAvg * 10) / 10,
        totalAvg: Math.round((emailsAvg + smsAvg) * 10) / 10,
      }
    })

    return NextResponse.json({
      dailyData: dataWithMovingAvg,
      summary: {
        totalEmails: emails.length,
        totalSms: smsMessages.length,
        totalMessages: emails.length + smsMessages.length,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      },
    })
  } catch (error) {
    console.error("Error fetching message stats:", error)
    return NextResponse.json({ error: "Failed to fetch message stats" }, { status: 500 })
  }
}
