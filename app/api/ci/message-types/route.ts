import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { MESSAGE_TYPE_LABELS } from "@/lib/message-classifier"

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
      if (ids.length === 0) {
        return NextResponse.json({ total: 0, classifiedTotal: 0, overallInboxRate: null, types: [] })
      }
      entityIdFilter = { in: ids }
    }

    // Date filter
    const dateFilter: { gte?: Date; lte?: Date } = {}
    if (fromDate) dateFilter.gte = new Date(fromDate)
    if (toDate) dateFilter.lte = new Date(toDate)

    // Fetch campaigns — only those with at least one messageType classified
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        isDeleted: false,
        isHidden: false,
        messageTypes: { isEmpty: false },
        ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { dateReceived: dateFilter } : {}),
      },
      select: {
        id: true,
        subject: true,
        senderName: true,
        senderEmail: true,
        dateReceived: true,
        inboxRate: true,
        inboxCount: true,
        spamCount: true,
        shareToken: true,
        messageTypes: true,
        entity: {
          select: {
            id: true,
            name: true,
            party: true,
            state: true,
          },
        },
      },
      orderBy: { dateReceived: "desc" },
    })

    // Also count the total corpus (including un-classified) for context
    const totalCorpus = await prisma.competitiveInsightCampaign.count({
      where: {
        isDeleted: false,
        isHidden: false,
        ...(entityIdFilter ? { entityId: entityIdFilter } : {}),
        ...(Object.keys(dateFilter).length > 0 ? { dateReceived: dateFilter } : {}),
      },
    })

    if (campaigns.length === 0) {
      return NextResponse.json({ total: totalCorpus, classifiedTotal: 0, overallInboxRate: null, types: [] })
    }

    // Build per-type stats
    type TypeStat = {
      type: string
      label: string
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
        entityState: string | null
      }>
    }

    const statsMap = new Map<string, TypeStat>()

    const getOrCreate = (type: string): TypeStat => {
      if (!statsMap.has(type)) {
        statsMap.set(type, {
          type,
          label: MESSAGE_TYPE_LABELS[type] ?? type.replace(/_/g, " "),
          count: 0,
          pct: 0,
          repCount: 0,
          demCount: 0,
          inboxCount: 0,
          spamCount: 0,
          avgInboxRate: null,
          examples: [],
        })
      }
      return statsMap.get(type)!
    }

    const classifiedTotal = campaigns.length

    for (const c of campaigns) {
      const partyLower = (c.entity?.party ?? "").toLowerCase()
      for (const type of c.messageTypes) {
        const stat = getOrCreate(type)
        stat.count++
        if (partyLower === "republican") stat.repCount++
        if (partyLower === "democrat") stat.demCount++
        stat.inboxCount += c.inboxCount ?? 0
        stat.spamCount += c.spamCount ?? 0

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
            entityState: c.entity?.state ?? null,
          })
        }
      }
    }

    // Compute derived fields
    for (const stat of statsMap.values()) {
      stat.pct = classifiedTotal > 0 ? Math.round((stat.count / classifiedTotal) * 1000) / 10 : 0
      const placement = stat.inboxCount + stat.spamCount
      stat.avgInboxRate = placement > 0 ? Math.round((stat.inboxCount / placement) * 1000) / 10 : null
    }

    // Overall inbox rate across the classified corpus
    const totalInboxCount = campaigns.reduce((s, c) => s + (c.inboxCount ?? 0), 0)
    const totalSpamCount = campaigns.reduce((s, c) => s + (c.spamCount ?? 0), 0)
    const totalPlacement = totalInboxCount + totalSpamCount
    const overallInboxRate =
      totalPlacement > 0 ? Math.round((totalInboxCount / totalPlacement) * 1000) / 10 : null

    // Sort by count descending
    const types = Array.from(statsMap.values()).sort((a, b) => b.count - a.count)

    return NextResponse.json({
      total: totalCorpus,
      classifiedTotal,
      overallInboxRate,
      types,
    })
  } catch (error) {
    console.error("[ci/message-types] Error:", error)
    return NextResponse.json({ error: "Failed to fetch message types" }, { status: 500 })
  }
}
