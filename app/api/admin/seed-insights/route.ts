import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const session = await getServerSession()
    if (!session || session.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const dateFilter = from && to
      ? { dateReceived: { gte: new Date(from), lte: new Date(to) } }
      : {}

    // Fetch all CI seed emails (locked = true, or assignedToClient = "rip")
    const ciSeeds = await prisma.seedEmail.findMany({
      where: {
        OR: [{ locked: true }, { assignedToClient: "rip" }],
        active: true,
      },
      select: { id: true, email: true, provider: true },
      orderBy: { email: "asc" },
    })

    // Fetch all campaigns within the date range that have placement data
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        ...dateFilter,
        isDeleted: false,
      },
      select: {
        seenBySeedEmails: true,
        inboxCount: true,
        spamCount: true,
      },
    })

    // Build per-seed stats by scanning seenBySeedEmails on each campaign
    const statsMap: Record<string, { total: number; inbox: number; spam: number }> = {}

    for (const seed of ciSeeds) {
      statsMap[seed.email] = { total: 0, inbox: 0, spam: 0 }
    }

    for (const campaign of campaigns) {
      const seen = Array.isArray(campaign.seenBySeedEmails)
        ? (campaign.seenBySeedEmails as string[])
        : []

      const seedCount = seen.length || 1
      const inboxPerSeed = Math.round((campaign.inboxCount ?? 0) / seedCount)
      const spamPerSeed = Math.round((campaign.spamCount ?? 0) / seedCount)

      for (const seedEmail of seen) {
        if (statsMap[seedEmail] !== undefined) {
          statsMap[seedEmail].total += 1
          statsMap[seedEmail].inbox += inboxPerSeed
          statsMap[seedEmail].spam += spamPerSeed
        }
      }
    }

    const result = ciSeeds.map((seed) => {
      const stats = statsMap[seed.email] ?? { total: 0, inbox: 0, spam: 0 }
      const placementTotal = stats.inbox + stats.spam
      const inboxPct = placementTotal > 0 ? Math.round((stats.inbox / placementTotal) * 100) : null
      const spamPct = inboxPct !== null ? 100 - inboxPct : null
      return {
        email: seed.email,
        provider: seed.provider,
        total: stats.total,
        inbox: stats.inbox,
        spam: stats.spam,
        inboxPct,
        spamPct,
      }
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("[seed-insights] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
