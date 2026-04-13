import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Fully public — no auth required (directory is publicly accessible)
export async function GET() {
  try {
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000)

    const [recentEmails, recentSms] = await Promise.all([
      prisma.competitiveInsightCampaign.findMany({
        where: {
          createdAt: { gte: since },
          isHidden: false,
          isDeleted: false,
          entity: { state: { not: null } },
        },
        select: {
          id: true,
          createdAt: true,
          entity: { select: { state: true } },
        },
      }),
      prisma.smsQueue.findMany({
        where: {
          createdAt: { gte: since },
          isHidden: false,
          isDeleted: false,
          entity: { state: { not: null } },
        },
        select: {
          id: true,
          createdAt: true,
          entity: { select: { state: true } },
        },
      }),
    ])

    const stateMap: Record<string, { emailCount: number; smsCount: number; latestAt: string }> = {}

    for (const email of recentEmails) {
      const state = email.entity?.state
      if (!state) continue
      if (!stateMap[state]) stateMap[state] = { emailCount: 0, smsCount: 0, latestAt: email.createdAt.toISOString() }
      stateMap[state].emailCount++
      if (email.createdAt.toISOString() > stateMap[state].latestAt) {
        stateMap[state].latestAt = email.createdAt.toISOString()
      }
    }

    for (const sms of recentSms) {
      const state = sms.entity?.state
      if (!state) continue
      if (!stateMap[state]) stateMap[state] = { emailCount: 0, smsCount: 0, latestAt: sms.createdAt.toISOString() }
      stateMap[state].smsCount++
      if (sms.createdAt.toISOString() > stateMap[state].latestAt) {
        stateMap[state].latestAt = sms.createdAt.toISOString()
      }
    }

    const activity = Object.entries(stateMap).map(([state, data]) => ({
      state,
      ...data,
      total: data.emailCount + data.smsCount,
    }))

    return NextResponse.json({ activity, since: since.toISOString() })
  } catch (error) {
    console.error("Error fetching public map activity:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
