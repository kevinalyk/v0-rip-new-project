import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const session = await getServerSession()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Require "all" (Professional) or "enterprise" plan, or internal RIP client
    const client = await prisma.client.findUnique({
      where: { id: session.user.clientId },
      select: { subscriptionPlan: true, slug: true },
    })

    const hasAccess =
      client?.subscriptionPlan === "all" ||
      client?.subscriptionPlan === "enterprise" ||
      client?.slug === "rip" ||
      session.user.role === "super_admin"

    if (!hasAccess) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "50")
    const skip = (page - 1) * pageSize
    const entityId = searchParams.get("entityId") || null

    if (!entityId) {
      return NextResponse.json({ error: "entityId is required" }, { status: 400 })
    }

    // Parse filter parameters
    const filterType = searchParams.get("filterType")
    const filterCheck = searchParams.get("filterCheck")
    const filterPlacement = searchParams.get("filterPlacement")
    const filterSection = searchParams.get("filterSection")

    // Base where: always scoped to the selected entity
    const baseWhere: any = {
      campaign: { entityId },
    }

    // Additional filters on top of entity scope
    const where: any = { ...baseWhere }

    if (filterType === "placement" && filterPlacement) {
      where.campaign = {
        entityId,
        ...(filterPlacement === "inbox" ? { inboxCount: { gt: 0 } } : { spamCount: { gt: 0 } }),
      }
    } else if (filterType === "section" && filterSection) {
      const sectionNum = parseInt(filterSection)
      where[`section${sectionNum}Score`] = { lt: 1.0 }
    } else if (filterType === "auth" && filterCheck) {
      switch (filterCheck) {
        case "spf":      where.hasSpf = false; break
        case "dkim":     where.hasDkim = false; break
        case "dmarc":    where.OR = [{ hasDmarc: false }, { hasDmarcAlignment: false }]; break
        case "tls":      where.hasTls = false; break
        case "oneClick": where.hasOneClickUnsubscribeHeaders = false; break
        case "unsubBody":where.hasUnsubscribeLinkInBody = false; break
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
                select: { id: true, name: true, type: true, party: true, state: true },
              },
              source: true,
            },
          },
        },
      }),
    ])

    // Aggregate stats scoped to this entity
    const allScores = await prisma.cIEmailCompliance.findMany({
      where: baseWhere,
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
        campaign: {
          select: { inboxCount: true, spamCount: true, inboxRate: true },
        },
      },
    })

    const count = allScores.length

    const avg = (field: keyof typeof allScores[0]) =>
      count > 0 ? allScores.filter((r) => r[field] === true).length / count : 0

    const avgScore = (field: keyof typeof allScores[0]) => {
      const vals = allScores.map((r) => r[field] as number | null).filter((v) => v != null) as number[]
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }

    // Compute avgTotalScore from section scores to avoid stale totalScore values
    const computedTotalScores = allScores.map((r) => {
      const s1 = r.section1Score ?? 0
      const s2 = r.section2Score ?? 0
      const s3 = r.section3Score ?? 0
      const s4 = r.section4Score ?? 0
      return (s1 + s2 + s3 + s4) / 4
    })
    const avgTotalScore =
      computedTotalScores.length > 0
        ? computedTotalScores.reduce((a, b) => a + b, 0) / computedTotalScores.length
        : 0

    // Inbox / spam aggregate for this entity
    const totalInbox = allScores.reduce((acc, r) => acc + (r.campaign?.inboxCount ?? 0), 0)
    const totalSpam  = allScores.reduce((acc, r) => acc + (r.campaign?.spamCount  ?? 0), 0)
    const totalSeeds = totalInbox + totalSpam
    const avgInboxRate = totalSeeds > 0 ? totalInbox / totalSeeds : null

    const inboxRateVals = allScores
      .map((r) => r.campaign?.inboxRate)
      .filter((v) => v != null) as number[]
    const avgInboxRatePct =
      inboxRateVals.length > 0
        ? inboxRateVals.reduce((a, b) => a + b, 0) / inboxRateVals.length
        : null

    const stats = {
      total: count,
      avgTotalScore,
      avgSection1: avgScore("section1Score"),
      avgSection2: avgScore("section2Score"),
      avgSection3: avgScore("section3Score"),
      avgSection4: avgScore("section4Score"),
      spfRate:          avg("hasSpf"),
      dkimRate:         avg("hasDkim"),
      tlsRate:          avg("hasTls"),
      dmarcRate:        avg("hasDmarc"),
      oneClickUnsubRate:avg("hasOneClickUnsubscribeHeaders"),
      unsubBodyRate:    avg("hasUnsubscribeLinkInBody"),
      noHiddenContentRate: avg("noHiddenContent"),
      totalInbox,
      totalSpam,
      avgInboxRate: avgInboxRate !== null ? avgInboxRate : (avgInboxRatePct !== null ? avgInboxRatePct / 100 : null),
    }

    return NextResponse.json({ rows, total, page, pageSize, stats })
  } catch (error) {
    console.error("[reports/compliance-summary] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
