import { prisma } from "@/lib/prisma"

// How many hours count as the "current" window we're measuring a surge/drop against.
const CURRENT_WINDOW_HOURS = 24
// How many days of history (immediately before the current window) we use to establish
// each entity's "normal" daily sending rate.
const BASELINE_WINDOW_DAYS = 7
// An entity needs at least this many sends in the current window to qualify as a "riser" —
// keeps a 1-send entity from showing up as an "infinite % increase".
const MIN_RISER_VOLUME = 3
// An entity needs at least this many average daily sends in the baseline window to qualify
// as a "faller" — an entity that barely sent anything before can't meaningfully "go quiet".
const MIN_FALLER_BASELINE_AVG = 2
// Below this baseline average, we treat any riser as a "new surge" (went from ~nothing to a lot)
// rather than reporting a % increase, since the % would be misleadingly huge or undefined.
const NEW_SURGE_BASELINE_THRESHOLD = 1

export interface TrendingEntity {
  entityId: string
  name: string
  type: string
  party: string | null
  state: string | null
  imageUrl: string | null
  current24h: number
  baselineAvgDaily: number
  delta: number
  pctChange: number | null
  isNewSurge: boolean
}

export interface TrendingEntitiesResult {
  risers: TrendingEntity[]
  fallers: TrendingEntity[]
  generatedAt: string
  currentWindowHours: number
  baselineWindowDays: number
}

interface EntityCounts {
  current: number
  baselineTotal: number
}

async function countByEntity(
  table: "competitiveInsightCampaign" | "smsQueue",
  dateField: "dateReceived" | "createdAt",
  start: Date,
  end: Date,
): Promise<Map<string, number>> {
  const rows = await (prisma[table] as any).groupBy({
    by: ["entityId"],
    where: {
      entityId: { not: null },
      isDeleted: false,
      [dateField]: { gte: start, lt: end },
    },
    _count: { entityId: true },
  })

  const map = new Map<string, number>()
  for (const row of rows as Array<{ entityId: string | null; _count: { entityId: number } }>) {
    if (!row.entityId) continue
    map.set(row.entityId, (map.get(row.entityId) || 0) + row._count.entityId)
  }
  return map
}

function mergeCounts(target: Map<string, EntityCounts>, source: Map<string, number>, key: "current" | "baselineTotal") {
  for (const [entityId, count] of source) {
    const existing = target.get(entityId) || { current: 0, baselineTotal: 0 }
    existing[key] += count
    target.set(entityId, existing)
  }
}

/**
 * Computes which CiEntities are trending up ("risers") or going unusually quiet ("fallers")
 * by comparing unique email+SMS campaign volume in the last 24h against each entity's
 * average daily volume over the trailing 7 days before that.
 */
export async function getTrendingEntities(): Promise<TrendingEntitiesResult> {
  const now = new Date()
  const currentStart = new Date(now.getTime() - CURRENT_WINDOW_HOURS * 60 * 60 * 1000)
  const baselineStart = new Date(currentStart.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const [emailCurrent, emailBaseline, smsCurrent, smsBaseline] = await Promise.all([
    countByEntity("competitiveInsightCampaign", "dateReceived", currentStart, now),
    countByEntity("competitiveInsightCampaign", "dateReceived", baselineStart, currentStart),
    countByEntity("smsQueue", "createdAt", currentStart, now),
    countByEntity("smsQueue", "createdAt", baselineStart, currentStart),
  ])

  const counts = new Map<string, EntityCounts>()
  mergeCounts(counts, emailCurrent, "current")
  mergeCounts(counts, smsCurrent, "current")
  mergeCounts(counts, emailBaseline, "baselineTotal")
  mergeCounts(counts, smsBaseline, "baselineTotal")

  const risersRaw: Omit<TrendingEntity, "name" | "type" | "party" | "state" | "imageUrl">[] = []
  const fallersRaw: Omit<TrendingEntity, "name" | "type" | "party" | "state" | "imageUrl">[] = []

  for (const [entityId, { current, baselineTotal }] of counts) {
    const baselineAvgDaily = baselineTotal / BASELINE_WINDOW_DAYS
    const delta = current - baselineAvgDaily
    const pctChange = baselineAvgDaily > 0 ? Math.round((delta / baselineAvgDaily) * 100) : null
    const isNewSurge = baselineAvgDaily < NEW_SURGE_BASELINE_THRESHOLD && current >= MIN_RISER_VOLUME

    if (current >= MIN_RISER_VOLUME && delta > 0) {
      risersRaw.push({
        entityId,
        current24h: current,
        baselineAvgDaily: Math.round(baselineAvgDaily * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        pctChange,
        isNewSurge,
      })
    }

    if (baselineAvgDaily >= MIN_FALLER_BASELINE_AVG && delta < 0) {
      fallersRaw.push({
        entityId,
        current24h: current,
        baselineAvgDaily: Math.round(baselineAvgDaily * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        pctChange,
        isNewSurge: false,
      })
    }
  }

  // Rank by absolute volume change first (a huge move matters more than a huge % on tiny numbers),
  // so an entity going from 0 to 40 outranks one going from 1 to 3.
  risersRaw.sort((a, b) => b.delta - a.delta)
  fallersRaw.sort((a, b) => a.delta - b.delta)

  const topRisers = risersRaw.slice(0, 5)
  const topFallers = fallersRaw.slice(0, 5)

  const entityIds = [...new Set([...topRisers, ...topFallers].map((e: { entityId: string }) => e.entityId))]

  interface EntityInfo {
    id: string
    name: string
    type: string
    party: string | null
    state: string | null
    imageUrl: string | null
  }

  const entities: EntityInfo[] = entityIds.length
    ? await prisma.ciEntity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, name: true, type: true, party: true, state: true, imageUrl: true },
      })
    : []
  const entityMap = new Map(entities.map((e) => [e.id, e]))

  const hydrate = (item: Omit<TrendingEntity, "name" | "type" | "party" | "state" | "imageUrl">): TrendingEntity | null => {
    const entity = entityMap.get(item.entityId)
    if (!entity) return null
    return {
      ...item,
      name: entity.name,
      type: entity.type,
      party: entity.party,
      state: entity.state,
      imageUrl: entity.imageUrl,
    }
  }

  return {
    risers: topRisers.map(hydrate).filter((e): e is TrendingEntity => e !== null),
    fallers: topFallers.map(hydrate).filter((e): e is TrendingEntity => e !== null),
    generatedAt: now.toISOString(),
    currentWindowHours: CURRENT_WINDOW_HOURS,
    baselineWindowDays: BASELINE_WINDOW_DAYS,
  }
}
