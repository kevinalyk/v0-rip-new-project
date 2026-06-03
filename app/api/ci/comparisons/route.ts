import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"

export type SortField = "volume" | "inboxRate" | "emailCount" | "smsCount" | "cadence"

export interface EntityProfile {
  entityId: string
  entityName: string
  entityParty: string | null
  entityState: string | null
  entityType: string
  entityImageUrl: string | null

  // Volume
  totalVolume: number
  emailCount: number
  smsCount: number
  emailSmsRatio: number // 0 = all SMS, 100 = all email

  // Placement
  avgInboxRate: number | null

  // Cadence — avg days between sends (email)
  avgCadenceDays: number | null

  // Top donation platform
  topDonationPlatform: string | null
  donationPlatformCounts: Record<string, number>

  // Top 3 subject patterns (by frequency)
  topSubjectPatterns: Array<{ pattern: string; count: number; pct: number }>

  // Top 3 message types (by frequency)
  topMessageTypes: Array<{ type: string; count: number; pct: number }>

  // Strategy profile chips
  strategyChips: string[]

  // Recent subjects (up to 5)
  recentSubjects: string[]
}

export interface ComparisonsData {
  total: number // total entities returned
  sortedBy: SortField
  entities: EntityProfile[]
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get("clientSlug")
    const party = searchParams.get("party") || undefined
    const state = searchParams.get("state") || undefined
    const entityType = searchParams.get("entityType") || undefined
    const fromDate = searchParams.get("fromDate") || undefined
    const toDate = searchParams.get("toDate") || undefined
    const sortBy = (searchParams.get("sortBy") || "volume") as SortField
    const limitParam = parseInt(searchParams.get("limit") || "50", 10)
    const limit = Math.min(Math.max(limitParam, 10), 200)

    // Build entity where clause
    const entityWhere: any = {}
    if (party && party !== "all") entityWhere.party = { equals: party, mode: "insensitive" }
    if (state && state !== "all") entityWhere.state = { equals: state, mode: "insensitive" }
    if (entityType && entityType !== "all") entityWhere.type = { equals: entityType, mode: "insensitive" }

    // Date filter for campaigns
    const dateFilter: any = {}
    if (fromDate) dateFilter.gte = new Date(fromDate)
    if (toDate) dateFilter.lte = new Date(toDate)
    const hasDates = Object.keys(dateFilter).length > 0

    // Fetch all matching entities with their campaigns and SMS
    const entities = await prisma.ciEntity.findMany({
      where: entityWhere,
      select: {
        id: true,
        name: true,
        party: true,
        state: true,
        type: true,
        imageUrl: true,
        campaigns: {
          where: {
            isDeleted: false,
            isHidden: false,
            ...(hasDates ? { dateReceived: dateFilter } : {}),
          },
          select: {
            id: true,
            subject: true,
            dateReceived: true,
            inboxCount: true,
            spamCount: true,
            donationPlatform: true,
            subjectPatterns: true,
            messageTypes: true,
          },
          orderBy: { dateReceived: "desc" },
        },
        smsMessages: {
          where: {
            processed: true,
            ...(hasDates ? { createdAt: dateFilter } : {}),
          },
          select: {
            id: true,
            createdAt: true,
          },
        },
      },
    })

    // Build profile for each entity that has at least one send
    const profiles: EntityProfile[] = []

    for (const entity of entities) {
      const emailCount = entity.campaigns.length
      const smsCount = entity.smsMessages.length
      const totalVolume = emailCount + smsCount

      if (totalVolume === 0) continue

      // Placement
      let totalInbox = 0
      let totalPlacement = 0
      for (const c of entity.campaigns) {
        totalInbox += c.inboxCount ?? 0
        totalPlacement += (c.inboxCount ?? 0) + (c.spamCount ?? 0)
      }
      const avgInboxRate =
        totalPlacement > 0 ? Math.round((totalInbox / totalPlacement) * 1000) / 10 : null

      // Email/SMS ratio
      const emailSmsRatio = totalVolume > 0 ? Math.round((emailCount / totalVolume) * 100) : 100

      // Cadence — avg gap between consecutive email sends
      let avgCadenceDays: number | null = null
      if (emailCount >= 2) {
        const sorted = [...entity.campaigns].sort(
          (a, b) => a.dateReceived.getTime() - b.dateReceived.getTime()
        )
        let totalGap = 0
        for (let i = 1; i < sorted.length; i++) {
          totalGap += sorted[i].dateReceived.getTime() - sorted[i - 1].dateReceived.getTime()
        }
        const avgMs = totalGap / (sorted.length - 1)
        avgCadenceDays = Math.round((avgMs / (1000 * 60 * 60 * 24)) * 10) / 10
      }

      // Donation platform
      const platformCounts: Record<string, number> = {}
      for (const c of entity.campaigns) {
        if (c.donationPlatform) {
          platformCounts[c.donationPlatform] = (platformCounts[c.donationPlatform] ?? 0) + 1
        }
      }
      const topDonationPlatform =
        Object.keys(platformCounts).sort((a, b) => platformCounts[b] - platformCounts[a])[0] ?? null

      // Subject patterns — count across campaigns
      const patternCounts: Record<string, number> = {}
      for (const c of entity.campaigns) {
        for (const p of c.subjectPatterns ?? []) {
          patternCounts[p] = (patternCounts[p] ?? 0) + 1
        }
      }
      const topSubjectPatterns = Object.entries(patternCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([pattern, count]) => ({
          pattern,
          count,
          pct: emailCount > 0 ? Math.round((count / emailCount) * 100) : 0,
        }))

      // Message types — count across campaigns
      const typeCounts: Record<string, number> = {}
      for (const c of entity.campaigns) {
        for (const t of c.messageTypes ?? []) {
          typeCounts[t] = (typeCounts[t] ?? 0) + 1
        }
      }
      const topMessageTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => ({
          type,
          count,
          pct: emailCount > 0 ? Math.round((count / emailCount) * 100) : 0,
        }))

      // Strategy profile chips
      const chips: string[] = []

      if (smsCount > 0 && emailCount === 0) chips.push("SMS Only")
      else if (emailCount > 0 && smsCount === 0) chips.push("Email Only")
      else if (smsCount > emailCount) chips.push("SMS-First")

      const hasUrgency = typeCounts["urgency_deadline"] > 0
      const hasMatch = typeCounts["match_offer"] > 0
      const hasFundraising = typeCounts["fundraising_ask"] > 0
      const hasSurvey = typeCounts["survey_poll"] > 0
      const hasAttack = typeCounts["attack_opposition"] > 0
      const hasNews = typeCounts["news_update"] > 0

      if (hasMatch && emailCount > 0 && (typeCounts["match_offer"] ?? 0) / emailCount > 0.15)
        chips.push("Match-Heavy")
      if (hasUrgency && emailCount > 0 && (typeCounts["urgency_deadline"] ?? 0) / emailCount > 0.2)
        chips.push("Urgency-Driven")
      if (hasFundraising && emailCount > 0 && (typeCounts["fundraising_ask"] ?? 0) / emailCount > 0.5)
        chips.push("Fundraising-Focused")
      if (hasSurvey && emailCount > 0 && (typeCounts["survey_poll"] ?? 0) / emailCount > 0.15)
        chips.push("Survey-Heavy")
      if (hasAttack) chips.push("Attack-Oriented")
      if (hasNews && emailCount > 0 && (typeCounts["news_update"] ?? 0) / emailCount > 0.2)
        chips.push("News-Driven")

      if (patternCounts["personalization"] && emailCount > 0 && patternCounts["personalization"] / emailCount > 0.3)
        chips.push("High Personalization")
      if (patternCounts["emoji"] && emailCount > 0 && patternCounts["emoji"] / emailCount > 0.2)
        chips.push("Emoji-Heavy")
      if (patternCounts["question"] && emailCount > 0 && patternCounts["question"] / emailCount > 0.2)
        chips.push("Question-Led")

      if (avgCadenceDays !== null && avgCadenceDays < 1.5) chips.push("High Frequency")
      else if (avgCadenceDays !== null && avgCadenceDays > 7) chips.push("Low Frequency")

      if (avgInboxRate !== null && avgInboxRate > 80) chips.push("Strong Inbox")
      else if (avgInboxRate !== null && avgInboxRate < 40) chips.push("Spam Prone")

      // Recent subjects (first 5 from already-desc-sorted campaigns)
      const recentSubjects = entity.campaigns.slice(0, 5).map((c) => c.subject)

      profiles.push({
        entityId: entity.id,
        entityName: entity.name,
        entityParty: entity.party,
        entityState: entity.state,
        entityType: entity.type,
        entityImageUrl: entity.imageUrl,
        totalVolume,
        emailCount,
        smsCount,
        emailSmsRatio,
        avgInboxRate,
        avgCadenceDays,
        topDonationPlatform,
        donationPlatformCounts: platformCounts,
        topSubjectPatterns,
        topMessageTypes,
        strategyChips: chips.slice(0, 5),
        recentSubjects,
      })
    }

    // Sort
    profiles.sort((a, b) => {
      switch (sortBy) {
        case "inboxRate":
          if (a.avgInboxRate === null && b.avgInboxRate === null) return 0
          if (a.avgInboxRate === null) return 1
          if (b.avgInboxRate === null) return -1
          return b.avgInboxRate - a.avgInboxRate
        case "emailCount":
          return b.emailCount - a.emailCount
        case "smsCount":
          return b.smsCount - a.smsCount
        case "cadence":
          if (a.avgCadenceDays === null && b.avgCadenceDays === null) return 0
          if (a.avgCadenceDays === null) return 1
          if (b.avgCadenceDays === null) return -1
          return a.avgCadenceDays - b.avgCadenceDays // lower cadence = more frequent = first
        case "volume":
        default:
          return b.totalVolume - a.totalVolume
      }
    })

    return NextResponse.json({
      total: profiles.length,
      sortedBy: sortBy,
      entities: profiles.slice(0, limit),
    } satisfies ComparisonsData)
  } catch (error) {
    console.error("[ci/comparisons] Error:", error)
    return NextResponse.json({ error: "Failed to fetch comparisons data" }, { status: 500 })
  }
}
