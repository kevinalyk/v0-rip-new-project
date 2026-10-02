import { prisma } from "@/lib/prisma"

// Each window pairs a "current" period with a longer "baseline" period immediately before
// it, used to establish each entity's normal daily sending rate. The current period's total
// is compared against what the baseline rate would predict for a period of that same length
// (baselineAvgDaily * currentWindowDays), so a 7-day current window is judged against 7 days'
// worth of the entity's own baseline rate, not against the raw baseline total.
export type TrendingWindowKey = "24h_7d" | "7d_30d" | "30d_90d"

interface WindowConfig {
  currentWindowDays: number
  baselineWindowDays: number
  // An entity needs at least this many sends in the current window to qualify as a "riser" —
  // keeps a tiny absolute increase from showing up as a huge/"infinite" % change.
  minRiserVolume: number
  // An entity needs at least this many average daily sends in the baseline window to qualify
  // as a "faller" — an entity that barely sent anything before can't meaningfully "go quiet".
  minFallerBaselineAvgDaily: number
  label: string
}

export const TRENDING_WINDOW_CONFIGS: Record<TrendingWindowKey, WindowConfig> = {
  "24h_7d": {
    currentWindowDays: 1,
    baselineWindowDays: 7,
    minRiserVolume: 3,
    minFallerBaselineAvgDaily: 2,
    label: "Last 24h vs. trailing 7-day avg",
  },
  "7d_30d": {
    currentWindowDays: 7,
    baselineWindowDays: 30,
    minRiserVolume: 5,
    minFallerBaselineAvgDaily: 2,
    label: "Last 7 days vs. trailing 30-day avg",
  },
  "30d_90d": {
    currentWindowDays: 30,
    baselineWindowDays: 90,
    minRiserVolume: 10,
    minFallerBaselineAvgDaily: 2,
    label: "Last 30 days vs. trailing 90-day avg",
  },
}

export const DEFAULT_TRENDING_WINDOW: TrendingWindowKey = "24h_7d"

export function isTrendingWindowKey(value: unknown): value is TrendingWindowKey {
  return typeof value === "string" && value in TRENDING_WINDOW_CONFIGS
}

// Below this baseline daily average, we treat any riser as a "new surge" (went from ~nothing
// to a lot) rather than reporting a % increase, since the % would be misleadingly huge or
// undefined (division by ~zero). This threshold is the same across all three windows — it's
// about the entity's absolute baseline rate, not the window length.
const NEW_SURGE_BASELINE_THRESHOLD = 1

export interface TrendingEntity {
  entityId: string
  name: string
  type: string
  party: string | null
  state: string | null
  imageUrl: string | null
  /** Total email+SMS sends in the current window. */
  currentCount: number
  /** Entity's average daily sends during the baseline window. */
  baselineAvgDaily: number
  /** currentCount minus what the baseline rate would predict for a window this long. */
  delta: number
  pctChange: number | null
  isNewSurge: boolean
}

export interface TrendingEntitiesResult {
  risers: TrendingEntity[]
  fallers: TrendingEntity[]
  generatedAt: string
  window: TrendingWindowKey
  windowLabel: string
  currentWindowDays: number
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
 * for the given window pair, by comparing unique email+SMS campaign volume in the current
 * period against what each entity's own baseline daily rate would predict for a period of
 * that length.
 *
 * "New surge" = an entity whose baseline daily average was under ~1 send/day (i.e. was
 * essentially inactive) that has now sent at least the window's minimum riser volume. These
 * are flagged separately from a plain % increase because the % would be undefined or
 * meaninglessly huge when the baseline is ~zero (e.g. 0 -> 40 isn't "infinite%", it's a
 * brand-new surge).
 */
export async function getTrendingEntities(window: TrendingWindowKey = DEFAULT_TRENDING_WINDOW): Promise<TrendingEntitiesResult> {
  const config = TRENDING_WINDOW_CONFIGS[window]
  const now = new Date()
  const currentStart = new Date(now.getTime() - config.currentWindowDays * 24 * 60 * 60 * 1000)
  const baselineStart = new Date(currentStart.getTime() - config.baselineWindowDays * 24 * 60 * 60 * 1000)

  const [emailCurrent, emailBaseline, smsCurrent, smsBaseline] = await Promise.all([
    countByEntity("competitiveInsightCampaign", "dateReceived", currentStart, now),
    countByEntity("competitiveInsightCampaign", "dateReceived", baselineStart, currentStart),
    countByEntity("smsQueue", "createdAt", currentStart, now),
    countByEntity("smsQueue", "createdAt", baselineStart, currentStart),
  ])

  const counts = new Map<string, EntityCounts>()
  mergeCounts(counts, emailCurrent, "current")
  mergeCounts(counts, emailBaseline, "baselineTotal")
  mergeCounts(counts, smsCurrent, "current")
  mergeCounts(counts, smsBaseline, "baselineTotal")

  const risersRaw: Omit<TrendingEntity, "name" | "type" | "party" | "state" | "imageUrl">[] = []
  const fallersRaw: Omit<TrendingEntity, "name" | "type" | "party" | "state" | "imageUrl">[] = []

  for (const [entityId, { current, baselineTotal }] of counts) {
    const baselineAvgDaily = baselineTotal / config.baselineWindowDays
    const expectedCurrent = baselineAvgDaily * config.currentWindowDays
    const delta = current - expectedCurrent
    const pctChange = expectedCurrent > 0 ? Math.round((delta / expectedCurrent) * 100) : null
    const isNewSurge = baselineAvgDaily < NEW_SURGE_BASELINE_THRESHOLD && current >= config.minRiserVolume

    if (current >= config.minRiserVolume && delta > 0) {
      risersRaw.push({
        entityId,
        currentCount: current,
        baselineAvgDaily: Math.round(baselineAvgDaily * 10) / 10,
        delta: Math.round(delta * 10) / 10,
        pctChange,
        isNewSurge,
      })
    }

    if (baselineAvgDaily >= config.minFallerBaselineAvgDaily && delta < 0) {
      fallersRaw.push({
        entityId,
        currentCount: current,
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
    window,
    windowLabel: config.label,
    currentWindowDays: config.currentWindowDays,
    baselineWindowDays: config.baselineWindowDays,
  }
}
