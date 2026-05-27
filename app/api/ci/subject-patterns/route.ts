import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { classifySubjectLine, SUBJECT_PATTERNS, type SubjectPattern } from "@/lib/subject-line-classifier"

export const dynamic = "force-dynamic"

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
    const state = searchParams.get("state") || undefined
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined

    // Resolve clientId
    let targetClientId = authResult.user.clientId!
    if (authResult.user.role === "super_admin" && clientSlug) {
      const targetClient = await prisma.client.findUnique({
        where: { slug: clientSlug },
        select: { id: true },
      })
      if (targetClient) targetClientId = targetClient.id
    }

    // Build entity filter
    let entityIdFilter: { in: string[] } | undefined = undefined
    const hasEntityFilter = senders.length > 0
    const hasPartyFilter = party && party !== "all"
    const hasStateFilter = state && state !== "all"

    if (hasEntityFilter || hasPartyFilter || hasStateFilter) {
      const entityWhere: any = {}
      if (hasEntityFilter) entityWhere.name = { in: senders, mode: "insensitive" }
      if (hasPartyFilter) entityWhere.party = { equals: party, mode: "insensitive" }
      if (hasStateFilter) entityWhere.state = { equals: state, mode: "insensitive" }

      const matchedEntities = await prisma.ciEntity.findMany({
        where: entityWhere,
        select: { id: true },
      })
      const ids = matchedEntities.map((e) => e.id)
      if (ids.length === 0) return NextResponse.json(buildEmptyResponse())
      entityIdFilter = { in: ids }
    }

    // Date filter
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (fromDate) dateFilter.gte = new Date(fromDate)
    if (toDate) dateFilter.lte = new Date(toDate)

    // Fetch all campaigns with subject + inboxing data
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        isDeleted: false,
        isHidden: false,
        ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { dateReceived: dateFilter } : {}),
      },
      select: {
        id: true,
        subject: true,
        rawSubject: true,
        senderName: true,
        senderEmail: true,
        dateReceived: true,
        inboxRate: true,
        inboxCount: true,
        spamCount: true,
        shareToken: true,
        entity: {
          select: {
            id: true,
            name: true,
            party: true,
          },
        },
      },
      orderBy: { dateReceived: "desc" },
    })

    if (campaigns.length === 0) {
      return NextResponse.json(buildEmptyResponse())
    }

    // Classify all subjects and build pattern stats
    const patternKeys = Object.keys(SUBJECT_PATTERNS) as SubjectPattern[]

    type PatternStat = {
      pattern: SubjectPattern
      label: string
      description: string
      count: number
      pct: number
      repCount: number
      demCount: number
      inboxCount: number
      spamCount: number
      avgInboxRate: number | null
      examples: Array<{
        id: string
        subject: string
        senderName: string
        senderEmail: string
        dateReceived: string
        inboxRate: number
        shareToken: string | null
        entityName: string | null
        entityParty: string | null
      }>
    }

    const stats: Record<SubjectPattern, PatternStat> = {} as any
    for (const key of patternKeys) {
      stats[key] = {
        pattern: key,
        label: SUBJECT_PATTERNS[key].label,
        description: SUBJECT_PATTERNS[key].description,
        count: 0,
        pct: 0,
        repCount: 0,
        demCount: 0,
        inboxCount: 0,
        spamCount: 0,
        avgInboxRate: null,
        examples: [],
      }
    }

    const total = campaigns.length

    for (const c of campaigns) {
      // Classify against rawSubject so merge tags ({{Name}}, [NAME], etc.) are intact,
      // not the sanitized subject which replaces them with [Omitted]
      const patterns = classifySubjectLine(c.rawSubject || c.subject)
      const party = (c.entity?.party ?? "").toLowerCase()

      for (const p of patterns) {
        const stat = stats[p]
        stat.count++
        if (party === "republican") stat.repCount++
        if (party === "democrat") stat.demCount++
        stat.inboxCount += c.inboxCount ?? 0
        stat.spamCount += c.spamCount ?? 0

        // Keep up to 10 most recent examples per pattern (campaigns are already sorted desc)
        if (stat.examples.length < 10) {
          stat.examples.push({
            id: c.id,
            subject: c.subject,
            senderName: c.senderName,
            senderEmail: c.senderEmail,
            dateReceived: c.dateReceived.toISOString(),
            inboxRate: c.inboxRate,
            shareToken: c.shareToken ?? null,
            entityName: c.entity?.name ?? null,
            entityParty: c.entity?.party ?? null,
          })
        }
      }
    }

    // Compute derived fields
    for (const key of patternKeys) {
      const stat = stats[key]
      stat.pct = total > 0 ? Math.round((stat.count / total) * 1000) / 10 : 0
      const placement = stat.inboxCount + stat.spamCount
      stat.avgInboxRate =
        placement > 0 ? Math.round((stat.inboxCount / placement) * 1000) / 10 : null
    }

    // Also compute overall inbox rate for the whole corpus (used as baseline for correlation table)
    const totalInboxCount = campaigns.reduce((s, c) => s + (c.inboxCount ?? 0), 0)
    const totalSpamCount = campaigns.reduce((s, c) => s + (c.spamCount ?? 0), 0)
    const totalPlacement = totalInboxCount + totalSpamCount
    const overallInboxRate =
      totalPlacement > 0
        ? Math.round((totalInboxCount / totalPlacement) * 1000) / 10
        : null

    // Return sorted by count desc
    const sortedStats = patternKeys
      .map((k) => stats[k])
      .sort((a, b) => b.count - a.count)

    return NextResponse.json({
      total,
      overallInboxRate,
      patterns: sortedStats,
    })
  } catch (error) {
    console.error("[ci/subject-patterns] Error:", error)
    return NextResponse.json({ error: "Failed to fetch subject patterns" }, { status: 500 })
  }
}

function buildEmptyResponse() {
  return {
    total: 0,
    overallInboxRate: null,
    patterns: [],
  }
}
