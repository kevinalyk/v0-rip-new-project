import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only RIP (super_admin) can access this
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

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
