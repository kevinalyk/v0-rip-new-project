import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Public endpoint — no auth required (directory is publicly accessible)
export async function GET(request: NextRequest) {
  try {
    const since = new Date(Date.now() - 3 * 60 * 60 * 1000)

    // Fetch recent emails grouped by entity state
    const recentEmails = await prisma.competitiveInsightCampaign.findMany({
      where: {
        createdAt: { gte: since },
        isHidden: false,
        isDeleted: false,
        entity: {
          state: { not: null },
        },
      },
      select: {
        id: true,
        createdAt: true,
        entity: {
          select: { state: true },
        },
      },
    })

    // Fetch recent SMS grouped by entity state
    const recentSms = await prisma.smsQueue.findMany({
      where: {
        createdAt: { gte: since },
        isHidden: false,
        isDeleted: false,
        entity: {
          state: { not: null },
        },
      },
      select: {
        id: true,
        createdAt: true,
        entity: {
          select: { state: true },
        },
      },
    })

    // Aggregate by state
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
    console.error("Error fetching map activity:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
