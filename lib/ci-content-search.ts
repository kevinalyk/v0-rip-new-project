/**
 * Read-only queries over the shared competitive-intelligence feed (seed emails
 * and SMS), shared by the internal CI Assignment MCP and the client-facing MCP.
 * Never returns client-private personal-subscription messages or full email
 * bodies.
 */

import prisma from "@/lib/prisma"
import { CiApiError } from "@/lib/ci-api-auth"
import { nameToSlug } from "@/lib/directory-utils"

export interface SearchContentParams {
  query: string
  match: "any" | "all"
  startDate?: string
  endDate?: string
  type: "email" | "sms" | "both"
  party?: "R" | "D"
  limit: number
  page: number
  entityLimit: number
  // Internal MCP only: adds per-email inbox/spam placement counts to email results.
  includePlacement?: boolean
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"
}

function parseDateRange(startDate?: string, endDate?: string) {
  const from = startDate ? new Date(startDate) : undefined
  const to = endDate ? new Date(endDate) : undefined
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    throw new CiApiError("startDate/endDate must be valid ISO date strings", 400)
  }
  const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined
  return { from, to, range }
}

function placementSummary(inbox: number, spam: number, notDelivered: number) {
  const total = inbox + spam + notDelivered
  return {
    inbox,
    spam,
    notDelivered,
    inboxRatePct: total > 0 ? Math.round((inbox / total) * 1000) / 10 : null,
    spamRatePct: total > 0 ? Math.round((spam / total) * 1000) / 10 : null,
  }
}

export async function searchContent(params: SearchContentParams) {
  const { query, match, startDate, endDate, type, party, limit, page, entityLimit, includePlacement } = params
  const wantEmail = type === "email" || type === "both"
  const wantSms = type === "sms" || type === "both"

  const { from, to, range: dateRange } = parseDateRange(startDate, endDate)

  const terms = Array.from(new Set(query.split(/\s+/).map((t) => t.trim()).filter(Boolean))).slice(0, 10)
  if (terms.length === 0) throw new CiApiError("query must contain at least one keyword", 400)
  const termMode = match === "all" ? "AND" : "OR"

  const partyFilter = party
    ? { entity: { is: { party: { equals: party === "R" ? "republican" : "democrat", mode: "insensitive" as const } } } }
    : {}

  const emailWhere = {
    isDeleted: false,
    isHidden: false,
    source: "seed",
    ...(dateRange ? { dateReceived: dateRange } : {}),
    ...partyFilter,
    [termMode]: terms.map((term) => ({
      OR: [
        { senderName: { contains: term, mode: "insensitive" as const } },
        { subject: { contains: term, mode: "insensitive" as const } },
        { emailPreview: { contains: term, mode: "insensitive" as const } },
        { emailContent: { contains: term, mode: "insensitive" as const } },
      ],
    })),
  }

  const smsWhere = {
    isDeleted: false,
    isHidden: false,
    source: "seed",
    ...(dateRange ? { createdAt: dateRange } : {}),
    ...partyFilter,
    [termMode]: terms.map((term) => ({ message: { contains: term, mode: "insensitive" as const } })),
  }

  // Page across both types by date: take the newest page*limit rows from each, merge, slice.
  const fetchCount = page * limit
  const entitySelect = { select: { name: true, party: true, state: true } }

  const [emails, sms, emailTotal, smsTotal, emailByEntity, smsByEntity] = await Promise.all([
    wantEmail
      ? prisma.competitiveInsightCampaign.findMany({
          where: emailWhere,
          orderBy: { dateReceived: "desc" },
          take: fetchCount,
          select: {
            id: true,
            senderEmail: true,
            subject: true,
            dateReceived: true,
            shareToken: true,
            entityId: true,
            entity: entitySelect,
            ...(includePlacement ? { inboxCount: true, spamCount: true, notDeliveredCount: true } : {}),
          },
        })
      : Promise.resolve([]),
    wantSms
      ? prisma.smsQueue.findMany({
          where: smsWhere,
          orderBy: { createdAt: "desc" },
          take: fetchCount,
          select: {
            id: true,
            phoneNumber: true,
            message: true,
            createdAt: true,
            shareToken: true,
            entityId: true,
            entity: entitySelect,
          },
        })
      : Promise.resolve([]),
    wantEmail ? prisma.competitiveInsightCampaign.count({ where: emailWhere }) : Promise.resolve(0),
    wantSms ? prisma.smsQueue.count({ where: smsWhere }) : Promise.resolve(0),
    wantEmail
      ? prisma.competitiveInsightCampaign.groupBy({ by: ["entityId"], where: emailWhere, _count: { _all: true } })
      : Promise.resolve([]),
    wantSms ? prisma.smsQueue.groupBy({ by: ["entityId"], where: smsWhere, _count: { _all: true } }) : Promise.resolve([]),
  ])

  const base = appUrl()
  const toResult = (
    kind: "email" | "sms",
    row: {
      id: string
      receivedAt: Date
      text: string | null
      from: string | null
      shareToken: string | null
      entity: { name: string; party: string | null; state: string | null } | null
    },
  ) => ({
    id: row.id,
    type: kind,
    entityName: row.entity?.name ?? null,
    entitySlug: row.entity ? nameToSlug(row.entity.name) : null,
    party: row.entity?.party ?? null,
    state: row.entity?.state ?? null,
    receivedAt: row.receivedAt.toISOString(),
    [kind === "email" ? "subject" : "text"]: row.text,
    from: row.from,
    link: row.shareToken ? `${base}/share/${row.shareToken}` : null,
  })

  const merged = [
    ...(emails as any[]).map((e) => ({
      ...toResult("email", {
        id: e.id,
        receivedAt: e.dateReceived,
        text: e.subject,
        from: e.senderEmail,
        shareToken: e.shareToken,
        entity: e.entity,
      }),
      ...(includePlacement ? { placement: placementSummary(e.inboxCount, e.spamCount, e.notDeliveredCount) } : {}),
    })),
    ...(sms as any[]).map((s) =>
      toResult("sms", {
        id: s.id,
        receivedAt: s.createdAt,
        text: s.message,
        from: s.phoneNumber,
        shareToken: s.shareToken,
        entity: s.entity,
      }),
    ),
  ]
    .sort((a, b) => (a.receivedAt < b.receivedAt ? 1 : -1))
    .slice((page - 1) * limit, page * limit)

  const counts = new Map<string | null, { emailCount: number; smsCount: number }>()
  for (const row of emailByEntity) {
    counts.set(row.entityId, { emailCount: row._count._all, smsCount: 0 })
  }
  for (const row of smsByEntity) {
    const existing = counts.get(row.entityId) ?? { emailCount: 0, smsCount: 0 }
    existing.smsCount = row._count._all
    counts.set(row.entityId, existing)
  }

  const entityIds = Array.from(counts.keys()).filter((id): id is string => id !== null)
  const entities = entityIds.length
    ? await prisma.ciEntity.findMany({
        where: { id: { in: entityIds } },
        select: { id: true, name: true, party: true, state: true },
      })
    : []
  type EntityInfo = { id: string; name: string; party: string | null; state: string | null }
  const entityById = new Map<string, EntityInfo>((entities as EntityInfo[]).map((e) => [e.id, e] as [string, EntityInfo]))

  const byEntity = Array.from(counts.entries())
    .filter(([id]) => id !== null)
    .map(([id, c]) => {
      const e = entityById.get(id as string)
      return {
        entityName: e?.name ?? null,
        entitySlug: e ? nameToSlug(e.name) : null,
        party: e?.party ?? null,
        state: e?.state ?? null,
        emailCount: c.emailCount,
        smsCount: c.smsCount,
        total: c.emailCount + c.smsCount,
      }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, entityLimit)

  const unassigned = counts.get(null)
  const total = emailTotal + smsTotal

  return {
    query: { terms, match, startDate: from?.toISOString() ?? null, endDate: to?.toISOString() ?? null, type, party: party ?? null },
    totals: { total, emails: emailTotal, sms: smsTotal, unassigned: (unassigned?.emailCount ?? 0) + (unassigned?.smsCount ?? 0) },
    pagination: { page, limit, hasMore: page * limit < total },
    byEntity,
    results: merged,
  }
}

const PREVIEW_MAX_CHARS = 600

/**
 * Single message detail for the client-facing MCP. Email returns subject,
 * sender, and a short text preview only (never the full body or CTA links);
 * SMS returns the full text since it is already short.
 */
export async function getMessage(kind: "email" | "sms", id: string) {
  const base = appUrl()
  const entitySelect = { select: { name: true, party: true, state: true, type: true } }

  if (kind === "email") {
    const row = await prisma.competitiveInsightCampaign.findFirst({
      where: { id, isDeleted: false, isHidden: false, source: "seed" },
      select: {
        id: true,
        senderName: true,
        senderEmail: true,
        subject: true,
        dateReceived: true,
        emailPreview: true,
        shareToken: true,
        entity: entitySelect,
      },
    })
    if (!row) throw new CiApiError("Message not found", 404)
    return {
      id: row.id,
      type: "email" as const,
      senderName: row.senderName,
      from: row.senderEmail,
      subject: row.subject,
      preview: row.emailPreview ? row.emailPreview.slice(0, PREVIEW_MAX_CHARS) : null,
      receivedAt: row.dateReceived.toISOString(),
      entityName: row.entity?.name ?? null,
      entitySlug: row.entity ? nameToSlug(row.entity.name) : null,
      entityType: row.entity?.type ?? null,
      party: row.entity?.party ?? null,
      state: row.entity?.state ?? null,
      link: row.shareToken ? `${base}/share/${row.shareToken}` : null,
    }
  }

  const row = await prisma.smsQueue.findFirst({
    where: { id, isDeleted: false, isHidden: false, source: "seed" },
    select: {
      id: true,
      phoneNumber: true,
      message: true,
      createdAt: true,
      shareToken: true,
      entity: entitySelect,
    },
  })
  if (!row) throw new CiApiError("Message not found", 404)
  return {
    id: row.id,
    type: "sms" as const,
    from: row.phoneNumber,
    text: row.message,
    receivedAt: row.createdAt.toISOString(),
    entityName: row.entity?.name ?? null,
    entitySlug: row.entity ? nameToSlug(row.entity.name) : null,
    entityType: row.entity?.type ?? null,
    party: row.entity?.party ?? null,
    state: row.entity?.state ?? null,
    link: row.shareToken ? `${base}/share/${row.shareToken}` : null,
  }
}

export const ENTITY_LIST_MAX_PAGE = 30

export async function listEntities(params: {
  query?: string
  party?: "R" | "D"
  state?: string
  type?: "politician" | "pac" | "organization" | "media" | "retail"
  limit: number
  page: number
}) {
  const { query, party, state, type, limit, page } = params
  const where = {
    ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
    ...(party ? { party: { equals: party === "R" ? "republican" : "democrat", mode: "insensitive" as const } } : {}),
    ...(state ? { state: { equals: state, mode: "insensitive" as const } } : {}),
    ...(type ? { type } : {}),
  }
  const [rows, total] = await Promise.all([
    prisma.ciEntity.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      select: { name: true, type: true, party: true, state: true, office: true },
    }),
    prisma.ciEntity.count({ where }),
  ])
  return {
    totals: { total },
    pagination: { page, limit, hasMore: page * limit < total },
    results: (rows as { name: string; type: string | null; party: string | null; state: string | null; office: string | null }[]).map((e) => ({
      name: e.name,
      slug: nameToSlug(e.name),
      type: e.type,
      party: e.party,
      state: e.state,
      office: e.office,
    })),
  }
}

export async function getEntityBySlug(slug: string) {
  // Names are the stable key; slugs are derived, so match on the derived slug.
  const candidates = await prisma.ciEntity.findMany({
    select: { id: true, name: true, type: true, party: true, state: true, office: true, description: true, bio: true },
  })
  const entity = candidates.find((e: { name: string }) => nameToSlug(e.name) === slug)
  if (!entity) throw new CiApiError("Entity not found", 404)

  const [emailCount, smsCount, lastEmail, lastSms] = await Promise.all([
    prisma.competitiveInsightCampaign.count({
      where: { entityId: entity.id, isDeleted: false, isHidden: false, source: "seed" },
    }),
    prisma.smsQueue.count({ where: { entityId: entity.id, isDeleted: false, isHidden: false, source: "seed" } }),
    prisma.competitiveInsightCampaign.findFirst({
      where: { entityId: entity.id, isDeleted: false, isHidden: false, source: "seed" },
      orderBy: { dateReceived: "desc" },
      select: { dateReceived: true },
    }),
    prisma.smsQueue.findFirst({
      where: { entityId: entity.id, isDeleted: false, isHidden: false, source: "seed" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ])

  const lastDates = [lastEmail?.dateReceived, lastSms?.createdAt].filter((d): d is Date => !!d)
  const lastMessageAt = lastDates.length ? new Date(Math.max(...lastDates.map((d) => d.getTime()))).toISOString() : null

  return {
    name: entity.name,
    slug,
    type: entity.type,
    party: entity.party,
    state: entity.state,
    office: entity.office,
    description: entity.description,
    bio: entity.bio,
    emailCount,
    smsCount,
    lastMessageAt,
  }
}

export type PlacementGroupBy = "none" | "entity" | "sender" | "sender_domain" | "party" | "day"

// Whitelisted SQL expressions - groupBy never reaches the query as user text.
const PLACEMENT_GROUP_SQL: Record<PlacementGroupBy, string> = {
  none: `'all'`,
  entity: `COALESCE(e."name", 'Unassigned')`,
  sender: `c."senderEmail"`,
  sender_domain: `lower(split_part(c."senderEmail", '@', 2))`,
  party: `COALESCE(lower(e."party"), 'unassigned')`,
  day: `to_char(c."dateReceived" AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
}

/**
 * Inbox vs spam placement for seed-inbox email, aggregated from the per-campaign
 * counts of how many seed inboxes delivered it to inbox / spam / not at all.
 * Internal MCP only. Counts are seed-inbox placements, so one campaign can
 * contribute to several. Aggregates only; no message bodies.
 */
export async function getInboxPlacement(params: {
  startDate?: string
  endDate?: string
  party?: "R" | "D"
  entityName?: string
  senderContains?: string
  groupBy: PlacementGroupBy
  limit: number
}) {
  const { startDate, endDate, party, entityName, senderContains, groupBy, limit } = params
  const { from, to } = parseDateRange(startDate, endDate)

  const conditions = [`c."source" = 'seed'`, `c."isDeleted" = false`, `c."isHidden" = false`]
  const values: unknown[] = []
  const bind = (value: unknown) => {
    values.push(value)
    return `$${values.length}`
  }

  if (from) conditions.push(`c."dateReceived" >= ${bind(from)}::timestamptz`)
  if (to) conditions.push(`c."dateReceived" <= ${bind(to)}::timestamptz`)
  if (party) conditions.push(`lower(e."party") = ${bind(party === "R" ? "republican" : "democrat")}`)
  if (entityName) conditions.push(`e."name" ILIKE '%' || ${bind(entityName)} || '%'`)
  if (senderContains) {
    const p = bind(senderContains)
    conditions.push(`(c."senderEmail" ILIKE '%' || ${p} || '%' OR c."senderName" ILIKE '%' || ${p} || '%')`)
  }

  const fromClause = `FROM "CompetitiveInsightCampaign" c LEFT JOIN "CiEntity" e ON e."id" = c."entityId" WHERE ${conditions.join(" AND ")}`
  const sums = `count(*)::int AS "campaigns",
    COALESCE(sum(c."inboxCount"), 0)::int AS "inbox",
    COALESCE(sum(c."spamCount"), 0)::int AS "spam",
    COALESCE(sum(c."notDeliveredCount"), 0)::int AS "notDelivered"`
  const groupExpr = PLACEMENT_GROUP_SQL[groupBy]
  const orderBy =
    groupBy === "day"
      ? `"group" ASC`
      : `COALESCE(sum(c."inboxCount"), 0) + COALESCE(sum(c."spamCount"), 0) + COALESCE(sum(c."notDeliveredCount"), 0) DESC`

  type Row = { group: string; campaigns: number; inbox: number; spam: number; notDelivered: number }
  const [groupRows, totalRows] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT ${groupExpr} AS "group", ${sums} ${fromClause} GROUP BY 1 ORDER BY ${orderBy} LIMIT ${Math.floor(limit)}`,
      ...values,
    ) as Promise<Row[]>,
    prisma.$queryRawUnsafe(`SELECT ${sums} ${fromClause}`, ...values) as Promise<Omit<Row, "group">[]>,
  ])

  const withRates = <T extends { inbox: number; spam: number; notDelivered: number }>(row: T) => ({
    ...row,
    ...placementSummary(row.inbox, row.spam, row.notDelivered),
  })

  return {
    query: {
      startDate: from?.toISOString() ?? null,
      endDate: to?.toISOString() ?? null,
      party: party ?? null,
      entityName: entityName ?? null,
      senderContains: senderContains ?? null,
      groupBy,
    },
    totals: withRates(totalRows[0] ?? { campaigns: 0, inbox: 0, spam: 0, notDelivered: 0 }),
    groups: groupRows.map(withRates),
  }
}
