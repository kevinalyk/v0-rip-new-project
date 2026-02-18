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

    // Get timezone offset from client (defaults to UTC)
    const { searchParams } = new URL(request.url)
    const tzOffset = parseInt(searchParams.get("tzOffset") || "0") // Offset in minutes

    // Calculate date boundaries in UTC
    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    
    const todayEnd = new Date(now)
    todayEnd.setHours(23, 59, 59, 999)
    
    const yesterdayStart = new Date(todayStart)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    
    const yesterdayEnd = new Date(todayStart)
    yesterdayEnd.setMilliseconds(yesterdayEnd.getMilliseconds() - 1)

    // Count emails for today
    const emailsToday = await prisma.competitiveInsightCampaign.count({
      where: {
        dateReceived: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    // Count emails for yesterday
    const emailsYesterday = await prisma.competitiveInsightCampaign.count({
      where: {
        dateReceived: {
          gte: yesterdayStart,
          lte: yesterdayEnd,
        },
      },
    })

    // Count SMS for today
    const smsToday = await prisma.smsQueue.count({
      where: {
        createdAt: {
          gte: todayStart,
          lte: todayEnd,
        },
      },
    })

    // Count SMS for yesterday
    const smsYesterday = await prisma.smsQueue.count({
      where: {
        createdAt: {
          gte: yesterdayStart,
          lte: yesterdayEnd,
        },
      },
    })

    return NextResponse.json({
      today: {
        emails: emailsToday,
        sms: smsToday,
        total: emailsToday + smsToday,
      },
      yesterday: {
        emails: emailsYesterday,
        sms: smsYesterday,
        total: emailsYesterday + smsYesterday,
      },
    })
  } catch (error) {
    console.error("Error fetching message stats:", error)
    return NextResponse.json({ error: "Failed to fetch message stats" }, { status: 500 })
  }
}
