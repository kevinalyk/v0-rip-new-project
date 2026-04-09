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

    // Parse filter parameters
    const filterType = searchParams.get("filterType")
    const filterParty = searchParams.get("filterParty")
    const filterCheck = searchParams.get("filterCheck")
    const filterPlacement = searchParams.get("filterPlacement")
    const filterSection = searchParams.get("filterSection")

    // Build where clause based on filter
    const where: any = {}

    if (filterType === "party" && filterParty) {
      where.campaign = { entity: { party: filterParty } }
    } else if (filterType === "placement" && filterParty && filterPlacement) {
      where.campaign = {
        entity: { party: filterParty },
        ...(filterPlacement === "inbox" ? { inboxCount: { gt: 0 } } : { spamCount: { gt: 0 } })
      }
    } else if (filterType === "section" && filterSection) {
      const sectionNum = parseInt(filterSection)
      const sectionKey = `section${sectionNum}Score`
      where[sectionKey] = { lt: 1.0 }
    } else if (filterType === "auth" && filterCheck) {
      // Build auth check filters
      if (filterParty) {
        where.campaign = { entity: { party: filterParty } }
      }
      
      switch (filterCheck) {
        case "spf":
          where.hasSpf = false
          break
        case "dkim":
          where.hasDkim = false
          break
        case "dmarc":
          where.OR = [{ hasDmarc: false }, { hasDmarcAlignment: false }]
          break
        case "tls":
          where.hasTls = false
          break
        case "oneClick":
          where.hasOneClickUnsubscribeHeaders = false
          break
        case "unsubBody":
          where.hasUnsubscribeLinkInBody = false
          break
      }
    }

    const [total, rows] = await Promise.all([
      prisma.cIEmailCompliance.count({ where }),
      prisma.cIEmailCompliance.findMany({
        where,
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

    // Compute avgTotalScore from section scores directly — the stored totalScore
    // column may have stale data from before the totalScore bug fix
    const computedTotalScores = allScores.map((r) => {
      const s1 = r.section1Score ?? 0
      const s2 = r.section2Score ?? 0
      const s3 = r.section3Score ?? 0
      const s4 = r.section4Score ?? 0
      return (s1 + s2 + s3 + s4) / 4
    })
    const avgTotalScore = computedTotalScores.length > 0
      ? computedTotalScores.reduce((a, b) => a + b, 0) / computedTotalScores.length
      : 0

    const stats = {
      total: count,
      avgTotalScore,
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

      // Compute compliance from section scores to avoid stale totalScore values
      const computedScores = subset.map((r) =>
        ((r.section1Score ?? 0) + (r.section2Score ?? 0) + (r.section3Score ?? 0) + (r.section4Score ?? 0)) / 4
      )
      const avgCompliance = computedScores.length > 0 ? computedScores.reduce((a, b) => a + b, 0) / computedScores.length : 0

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
