import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const session = await getServerSession()

    if (!session || session.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "50")
    const skip = (page - 1) * pageSize

    const [total, rows] = await Promise.all([
      prisma.cIEmailCompliance.count(),
      prisma.cIEmailCompliance.findMany({
        skip,
        take: pageSize,
        orderBy: { checkedAt: "desc" },
        include: {
          campaign: {
            select: {
              id: true,
              senderName: true,
              senderEmail: true,
              subject: true,
              dateReceived: true,
              inboxCount: true,
              spamCount: true,
              notDeliveredCount: true,
              inboxRate: true,
              entityId: true,
              entity: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  party: true,
                  state: true,
                },
              },
              source: true,
            },
          },
        },
      }),
    ])

    // Aggregate stats
    const allScores = await prisma.cIEmailCompliance.findMany({
      select: {
        totalScore: true,
        section1Score: true,
        section2Score: true,
        section3Score: true,
        section4Score: true,
        hasSpf: true,
        hasDkim: true,
        hasTls: true,
        hasDmarc: true,
        hasOneClickUnsubscribeHeaders: true,
        hasUnsubscribeLinkInBody: true,
        noHiddenContent: true,
      },
    })

    const count = allScores.length
    const avg = (field: (keyof typeof allScores[0])) =>
      count > 0
        ? allScores.filter((r) => r[field] === true).length / count
        : 0

    const avgScore = (field: keyof typeof allScores[0]) => {
      const vals = allScores.map((r) => r[field] as number | null).filter((v) => v != null) as number[]
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }

    const stats = {
      total: count,
      avgTotalScore: avgScore("totalScore"),
      avgSection1: avgScore("section1Score"),
      avgSection2: avgScore("section2Score"),
      avgSection3: avgScore("section3Score"),
      avgSection4: avgScore("section4Score"),
      spfRate: avg("hasSpf"),
      dkimRate: avg("hasDkim"),
      tlsRate: avg("hasTls"),
      dmarcRate: avg("hasDmarc"),
      oneClickUnsubRate: avg("hasOneClickUnsubscribeHeaders"),
      unsubBodyRate: avg("hasUnsubscribeLinkInBody"),
      noHiddenContentRate: avg("noHiddenContent"),
    }

    // Party split — R vs D compliance scores and inbox/spam rates
    const partyRows = await prisma.cIEmailCompliance.findMany({
      select: {
        totalScore: true,
        section1Score: true,
        section2Score: true,
        section3Score: true,
        section4Score: true,
        hasSpf: true,
        hasDkim: true,
        hasDmarc: true,
        hasOneClickUnsubscribeHeaders: true,
        campaign: {
          select: {
            inboxCount: true,
            spamCount: true,
            notDeliveredCount: true,
            inboxRate: true,
            entity: { select: { party: true } },
          },
        },
      },
    })

    const buildPartyStat = (party: string) => {
      const subset = partyRows.filter(
        (r) => r.campaign.entity?.party?.toLowerCase() === party
      )
      const n = subset.length
      if (n === 0) return { count: 0, avgCompliance: 0, avgInboxRate: 0, spamRate: 0, spfRate: 0, dkimRate: 0, dmarcRate: 0, oneClickRate: 0 }

      const scoreVals = subset.map((r) => r.totalScore).filter((v) => v != null) as number[]
      const avgCompliance = scoreVals.length > 0 ? scoreVals.reduce((a, b) => a + b, 0) / scoreVals.length : 0

      // inboxRate is stored as a percentage (e.g. 66.7), divide by 100 to get a fraction
      const inboxVals = subset.map((r) => r.campaign.inboxRate).filter((v) => v != null) as number[]
      const avgInboxRate = inboxVals.length > 0 ? (inboxVals.reduce((a, b) => a + b, 0) / inboxVals.length) / 100 : 0

      // Compute spam rate from raw counts so it's always accurate
      const totalDelivered = subset.reduce((acc, r) => acc + r.campaign.inboxCount + r.campaign.spamCount, 0)
      const totalSpam = subset.reduce((acc, r) => acc + r.campaign.spamCount, 0)
      const spamRate = totalDelivered > 0 ? totalSpam / totalDelivered : 0

      return {
        count: n,
        avgCompliance,
        avgInboxRate,
        spamRate,
        spfRate: subset.filter((r) => r.hasSpf).length / n,
        dkimRate: subset.filter((r) => r.hasDkim).length / n,
        dmarcRate: subset.filter((r) => r.hasDmarc).length / n,
        oneClickRate: subset.filter((r) => r.hasOneClickUnsubscribeHeaders).length / n,
      }
    }

    const partySplit = {
      republican: buildPartyStat("republican"),
      democrat: buildPartyStat("democrat"),
    }

    return NextResponse.json({ rows, total, page, pageSize, stats, partySplit })
  } catch (error) {
    console.error("[compliance-summary] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
