import prisma from "@/lib/prisma"
import { getCIHistoryDays, type SubscriptionPlan } from "@/lib/subscription-utils"
import { OFFICES } from "@/lib/campaign-filter-options"

export interface FeedFilters {
  search?: string
  party?: string
  state?: string
  office?: string
  entityType?: string
  messageType?: "email" | "sms"
  tag?: string
  subscriptionsOnly?: boolean
}

export interface FeedCursor {
  dateReceived: string // ISO timestamp
  id: string
}

export interface FeedItem {
  id: string
  type: "email" | "sms"
  senderName: string
  senderEmail: string
  subject: string
  dateReceived: string
  inboxRate: number
  entityId: string | null
  entity: { id: string; name: string; type: string; party: string | null; state: string | null } | null
}

const PAGE_SIZE = 25

function encodeCursor(item: { dateReceived: string; id: string }): string {
  return Buffer.from(JSON.stringify(item)).toString("base64url")
}

export function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"))
    if (typeof parsed?.dateReceived === "string" && typeof parsed?.id === "string") return parsed
    return null
  } catch {
    return null
  }
}

/**
 * Computes the data-retention-aware date floor for a client: the more restrictive of
 * the plan's CI history window and the client's own dataRetentionDays.
 */
async function getDateFloor(clientId: string, plan: SubscriptionPlan): Promise<Date | null> {
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { dataRetentionDays: true } })
  const planDays = getCIHistoryDays(plan)
  const retentionDays = client?.dataRetentionDays ?? null

  const days = [planDays, retentionDays].filter((d): d is number => d !== null && d !== undefined)
  if (days.length === 0) return null

  const minDays = Math.min(...days)
  return new Date(Date.now() - minDays * 24 * 60 * 60 * 1000)
}

async function getEntityIdsForClient(clientId: string, subscriptionsOnly: boolean, filters: FeedFilters) {
  const entityWhere: any = {}
  if (filters.party) entityWhere.party = filters.party
  if (filters.state) entityWhere.state = filters.state
  if (filters.entityType) entityWhere.type = filters.entityType
  if (filters.office) {
    const office = OFFICES.find((o) => o.value === filters.office)
    if (office) entityWhere.office = { contains: office.match, mode: "insensitive" }
  }

  if (subscriptionsOnly) {
    const subs = await prisma.ciEntitySubscription.findMany({
      where: { clientId, entity: Object.keys(entityWhere).length ? entityWhere : undefined },
      select: { entityId: true },
    })
    return subs.map((s) => s.entityId)
  }

  if (Object.keys(entityWhere).length === 0) return null // no entity-level filtering needed

  const entities = await prisma.ciEntity.findMany({ where: entityWhere, select: { id: true } })
  return entities.map((e) => e.id)
}

/**
 * Cursor-paginated feed for the mobile app. Enforces client isolation, hidden/deleted
 * flags, and plan/data-retention limits identically to the web feed
 * (app/api/competitive-insights/route.ts), but exposes cursor pagination instead of
 * page/limit at the boundary. Ordering is a stable compound key (dateReceived DESC,
 * id DESC) so concurrent inserts cannot duplicate or skip rows across pages.
 */
export async function getFeedPage(
  clientId: string,
  plan: SubscriptionPlan,
  filters: FeedFilters,
  cursor: FeedCursor | null,
): Promise<{ items: FeedItem[]; nextCursor: string | null; hasMore: boolean }> {
  const dateFloor = await getDateFloor(clientId, plan)
  const entityIds = await getEntityIdsForClient(clientId, filters.subscriptionsOnly ?? false, filters)

  const cursorWhere = cursor
    ? {
        OR: [
          { dateReceived: { lt: new Date(cursor.dateReceived) } },
          { dateReceived: new Date(cursor.dateReceived), id: { lt: cursor.id } },
        ],
      }
    : {}

  const dateWhere = dateFloor ? { dateReceived: { gte: dateFloor } } : {}

  const searchWhere = filters.search
    ? {
        OR: [
          { subject: { contains: filters.search, mode: "insensitive" as const } },
          { senderName: { contains: filters.search, mode: "insensitive" as const } },
        ],
      }
    : {}

  const emailWhere: any = {
    isHidden: false,
    isDeleted: false,
    OR: [{ entityId: entityIds ? { in: entityIds } : undefined }, { clientId }],
    ...dateWhere,
    ...cursorWhere,
    ...searchWhere,
  }
  // Remove the `entityId: undefined` no-op branch when there's no entity filter.
  if (!entityIds) emailWhere.OR = [{ clientId }]

  const smsWhere: any = {
    isHidden: false,
    isDeleted: false,
    processed: true,
    OR: [{ entityId: entityIds ? { in: entityIds } : undefined }, { clientId }],
    ...(dateFloor ? { createdAt: { gte: dateFloor } } : {}),
    ...(cursor
      ? {
          OR: [
            { createdAt: { lt: new Date(cursor.dateReceived) } },
            { createdAt: new Date(cursor.dateReceived), id: { lt: cursor.id } },
          ],
        }
      : {}),
  }
  if (!entityIds) smsWhere.OR = [{ clientId }]

  const includeEmail = filters.messageType !== "sms"
  const includeSms = filters.messageType !== "email"

  const [emailRows, smsRows] = await Promise.all([
    includeEmail
      ? prisma.competitiveInsightCampaign.findMany({
          where: emailWhere,
          include: { entity: { select: { id: true, name: true, type: true, party: true, state: true } } },
          orderBy: [{ dateReceived: "desc" }, { id: "desc" }],
          take: PAGE_SIZE + 1,
        })
      : [],
    includeSms
      ? prisma.smsQueue.findMany({
          where: smsWhere,
          include: { entity: { select: { id: true, name: true, type: true, party: true, state: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: PAGE_SIZE + 1,
        })
      : [],
  ])

  const merged: FeedItem[] = [
    ...emailRows.map((c) => ({
      id: c.id,
      type: "email" as const,
      senderName: c.senderName,
      senderEmail: c.senderEmail,
      subject: c.subject,
      dateReceived: c.dateReceived.toISOString(),
      inboxRate: c.inboxRate,
      entityId: c.entityId,
      entity: c.entity,
    })),
    ...smsRows.map((s) => ({
      id: s.id,
      type: "sms" as const,
      senderName: s.phoneNumber || "Unknown",
      senderEmail: s.phoneNumber || "",
      subject: s.message?.substring(0, 100) || "SMS Message",
      dateReceived: s.createdAt.toISOString(),
      inboxRate: 100,
      entityId: s.entityId,
      entity: s.entity,
    })),
  ].sort((a, b) => (a.dateReceived === b.dateReceived ? (a.id < b.id ? 1 : -1) : a.dateReceived < b.dateReceived ? 1 : -1))

  const page = merged.slice(0, PAGE_SIZE)
  const hasMore = merged.length > PAGE_SIZE
  const last = page[page.length - 1]
  const nextCursor = hasMore && last ? encodeCursor({ dateReceived: last.dateReceived, id: last.id }) : null

  return { items: page, nextCursor, hasMore }
}

export async function getFeedItemById(
  clientId: string,
  id: string,
  type: "email" | "sms",
): Promise<FeedItem & { emailContent?: string | null; emailPreview?: string | null; ctaLinks?: unknown[] } | null> {
  if (type === "email") {
    const campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { id },
      include: { entity: { select: { id: true, name: true, type: true, party: true, state: true } } },
    })
    if (!campaign || campaign.isDeleted || campaign.isHidden) return null
    // Client isolation: must be reachable either via the client's own personal
    // subscription or via a followed entity.
    const accessible =
      campaign.clientId === clientId ||
      (campaign.entityId &&
        (await prisma.ciEntitySubscription.findUnique({
          where: { clientId_entityId: { clientId, entityId: campaign.entityId } },
        })))
    if (!accessible) return null

    return {
      id: campaign.id,
      type: "email",
      senderName: campaign.senderName,
      senderEmail: campaign.senderEmail,
      subject: campaign.subject,
      dateReceived: campaign.dateReceived.toISOString(),
      inboxRate: campaign.inboxRate,
      entityId: campaign.entityId,
      entity: campaign.entity,
      emailContent: campaign.emailContent,
      emailPreview: campaign.emailPreview,
      ctaLinks: Array.isArray(campaign.ctaLinks) ? (campaign.ctaLinks as unknown[]) : [],
    }
  }

  const sms = await prisma.smsQueue.findUnique({
    where: { id },
    include: { entity: { select: { id: true, name: true, type: true, party: true, state: true } } },
  })
  if (!sms || sms.isDeleted || sms.isHidden) return null
  const accessible =
    sms.clientId === clientId ||
    (sms.entityId &&
      (await prisma.ciEntitySubscription.findUnique({
        where: { clientId_entityId: { clientId, entityId: sms.entityId } },
      })))
  if (!accessible) return null

  return {
    id: sms.id,
    type: "sms",
    senderName: sms.phoneNumber || "Unknown",
    senderEmail: sms.phoneNumber || "",
    subject: sms.message?.substring(0, 100) || "SMS Message",
    dateReceived: sms.createdAt.toISOString(),
    inboxRate: 100,
    entityId: sms.entityId,
    entity: sms.entity,
    emailContent: sms.message,
    emailPreview: sms.message,
    ctaLinks: sms.ctaLinks ? JSON.parse(sms.ctaLinks) : [],
  }
}
