import prisma from "@/lib/prisma"
import { getCIHistoryDays, type SubscriptionPlan } from "@/lib/subscription-utils"
import { MobileAuthError } from "@/lib/mobile-auth"
import { getEntityMappings } from "@/lib/ci-mapping-cache"

export const MOBILE_ENTITY_TYPES = [
  { value: "politician", label: "Politicians" },
  { value: "pac", label: "PACs" },
  { value: "organization", label: "Organizations" },
] as const

export const MOBILE_MESSAGE_FILTERS = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "third_party", label: "Third Party" },
  { value: "house_file", label: "House File" },
] as const

export const MOBILE_DONATION_PLATFORMS = [
  { value: "winred", label: "WinRed" },
  { value: "actblue", label: "ActBlue" },
  { value: "anedot", label: "Anedot" },
  { value: "psq", label: "PSQ" },
  { value: "ngpvan", label: "NGPVAN" },
  { value: "substack", label: "Substack" },
] as const

export type MobileDonationPlatform = (typeof MOBILE_DONATION_PLATFORMS)[number]["value"]

type MobileFeedEntityOption = {
  id: string
  name: string
  type: string
  party: string | null
  state: string | null
  isFollowing: boolean
}

export interface FeedFilters {
  search?: string
  entityIds?: string[]
  party?: string
  state?: string
  entityType?: string
  messageType?: "email" | "sms"
  thirdParty?: boolean
  houseFileOnly?: boolean
  donationPlatform?: MobileDonationPlatform
  fromDate?: Date
  toDate?: Date
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

/**
 * Returns null when no cursor was supplied at all. Throws a 400 MobileAuthError when a
 * cursor WAS supplied but doesn't decode to a well-formed { dateReceived, id } pair — a
 * malformed cursor must be rejected outright, not silently treated as "start from the
 * beginning" (which could mask client bugs or be used to probe pagination behavior).
 */
export function decodeCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"))
    if (
      parsed &&
      typeof parsed.dateReceived === "string" &&
      !Number.isNaN(new Date(parsed.dateReceived).getTime()) &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { dateReceived: parsed.dateReceived, id: parsed.id }
    }
  } catch {
    // fall through to the shared invalid-cursor error below
  }
  throw new MobileAuthError(400, "INVALID_CURSOR", "The provided cursor is malformed")
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

/**
 * The data_broker exclusion is a hard access-model rule (see file header) and must
 * never be overridable by a caller-supplied filter — including `entityType` itself.
 * This is expressed as its own AND clause rather than assigned into the same `type`
 * key that `entityType` also targets: assigning both to `where.type` let the second
 * assignment (`entityType`) silently clobber the first (the exclusion), so passing
 * `entityType=data_broker` bypassed the exclusion entirely and returned data_broker
 * campaigns through the shared feed. Expressing both as separate AND conditions means
 * `entityType=data_broker` now combines `{ not: "data_broker" } AND { equals:
 * "data_broker" }` — a contradiction that correctly yields zero rows instead of
 * exposing them.
 */
function entityAttributeWhere(filters: FeedFilters): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [{ type: { not: "data_broker" } }]
  if (filters.party) {
    const party = filters.party.toLowerCase()
    if (party === "independent" || party === "third party") {
      conditions.push({
        OR: [
          { party: { equals: "independent", mode: "insensitive" } },
          { party: { equals: "third party", mode: "insensitive" } },
          { party: { equals: "ind", mode: "insensitive" } },
          { party: { equals: "i", mode: "insensitive" } },
        ],
      })
    } else {
      conditions.push({ party: { equals: filters.party, mode: "insensitive" } })
    }
  }
  if (filters.state) conditions.push({ state: { equals: filters.state, mode: "insensitive" } })
  if (filters.entityType) conditions.push({ type: { equals: filters.entityType, mode: "insensitive" } })
  return { AND: conditions }
}

/**
 * Resolves the tag and subscriptionsOnly filters — both are per-client join tables
 * (EntityTag, CiEntitySubscription), not entity attributes, so they can't be expressed
 * as a plain `entity: {...}` relation filter. Returns null when neither filter is
 * active (no restriction), or the intersection of whichever filters ARE active
 * (mirrors the web feed's `entityIdSets` intersection logic). An empty array is a
 * valid, meaningful result — e.g. following nothing while `subscriptionsOnly=true`
 * must return zero items, not the full unrestricted feed.
 */
async function resolveEntityIdRestriction(clientId: string, filters: FeedFilters): Promise<string[] | null> {
  const sets: string[][] = []

  if (filters.entityIds?.length) sets.push([...new Set(filters.entityIds)])

  if (filters.subscriptionsOnly) {
    const subs = await prisma.ciEntitySubscription.findMany({ where: { clientId }, select: { entityId: true } })
    sets.push(subs.map((s: (typeof subs)[number]) => s.entityId))
  }

  if (filters.tag) {
    const tagged = await prisma.entityTag.findMany({
      where: { clientId, tagName: filters.tag },
      select: { entityId: true },
    })
    sets.push(tagged.map((t: (typeof tagged)[number]) => t.entityId))
  }

  if (sets.length === 0) return null
  if (sets.length === 1) return sets[0]
  return sets[0].filter((id) => sets.every((set) => set.includes(id)))
}

function getDateBounds(dateFloor: Date | null, filters: FeedFilters): { gte?: Date; lte?: Date } | null {
  const lowerBounds = [dateFloor, filters.fromDate].filter((date): date is Date => Boolean(date))
  const gte = lowerBounds.length
    ? new Date(Math.max(...lowerBounds.map((date) => date.getTime())))
    : undefined
  const lte = filters.toDate

  if (!gte && !lte) return null
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) }
}

const PLATFORM_DOMAINS: Record<MobileDonationPlatform, string[]> = {
  winred: ["winred.com"],
  actblue: ["actblue.com"],
  anedot: ["anedot.com"],
  psq: ["psqimpact.com", "politicalsurveyquestions.com", "psqsurveys.com"],
  ngpvan: ["ngpvan.com"],
  substack: ["substack.com"],
}

function emailPlatformWhere(platform: MobileDonationPlatform | undefined): Record<string, unknown> | null {
  if (!platform) return null
  if (platform === "substack") {
    return { senderEmail: { endsWith: "@substack.com", mode: "insensitive" } }
  }
  return {
    OR: [
      { donationPlatform: { equals: platform, mode: "insensitive" } },
      // Older rows sometimes stored the CTA array as a JSON string before the
      // normalized donationPlatform column was backfilled. Keep those rows visible
      // so mobile and web filters agree on historical results.
      ...PLATFORM_DOMAINS[platform].map((domain) => ({ ctaLinks: { string_contains: domain } })),
    ],
  }
}

function smsPlatformWhere(platform: MobileDonationPlatform | undefined): Record<string, unknown> | null {
  if (!platform) return null
  return {
    OR: PLATFORM_DOMAINS[platform].map((domain) => ({ ctaLinks: { contains: domain, mode: "insensitive" } })),
  }
}

type OwnershipWhere = {
  email: Record<string, unknown> | null
  sms: Record<string, unknown> | null
}

type LegacyEmailOwnershipCandidate = {
  id: string
  entityId: string | null
  senderEmail: string
}

type LegacySmsOwnershipCandidate = {
  id: string
  entityId: string | null
  phoneNumber: string | null
}

async function resolveOwnershipWhere(filters: FeedFilters): Promise<OwnershipWhere> {
  // Third Party and House File are an exhaustive pair in the web UI. Selecting both
  // means "either classification," just like selecting both Email and SMS.
  if (filters.thirdParty === filters.houseFileOnly) return { email: null, sms: null }

  const expectedThirdParty = filters.thirdParty === true
  const { mappingsByEntity, phonesByEntity } = await getEntityMappings()

  // isThirdParty is frozen for every newly assigned record. Rows that predate that
  // column are null, so classify only that legacy subset with the same mappings used
  // by the web feed. This keeps the common path indexed without making older House
  // File and Third Party messages disappear from mobile results.
  const [legacyEmails, legacySms] = await Promise.all([
    prisma.competitiveInsightCampaign.findMany({
      where: { isThirdParty: null, entityId: { not: null }, entity: { type: { not: "data_broker" } } },
      select: { id: true, entityId: true, senderEmail: true },
    }),
    prisma.smsQueue.findMany({
      where: { isThirdParty: null, entityId: { not: null }, entity: { type: { not: "data_broker" } } },
      select: { id: true, entityId: true, phoneNumber: true },
    }),
  ])

  const legacyEmailIds = legacyEmails
    .filter((campaign: LegacyEmailOwnershipCandidate) => {
      const mappings = campaign.entityId ? mappingsByEntity[campaign.entityId] : undefined
      if (!mappings) return expectedThirdParty === false
      const email = campaign.senderEmail.toLowerCase()
      const domain = email.split("@")[1]
      const isThirdParty = !mappings.emails.has(email) && (!domain || !mappings.domains.has(domain))
      return isThirdParty === expectedThirdParty
    })
    .map((campaign: LegacyEmailOwnershipCandidate) => campaign.id)

  const legacySmsIds = legacySms
    .filter((message: LegacySmsOwnershipCandidate) => {
      const phones = message.entityId ? phonesByEntity[message.entityId] : undefined
      const isThirdParty = phones ? !phones.has(message.phoneNumber ?? "") : false
      return isThirdParty === expectedThirdParty
    })
    .map((message: LegacySmsOwnershipCandidate) => message.id)

  const includeLegacy = (ids: string[]): Record<string, unknown> => ({
    OR: [
      { isThirdParty: expectedThirdParty },
      { AND: [{ isThirdParty: null }, { id: { in: ids } }] },
    ],
  })

  return { email: includeLegacy(legacyEmailIds), sms: includeLegacy(legacySmsIds) }
}

export async function listMobileFeedEntities(clientId: string) {
  const [entities, subscriptions] = await Promise.all([
    prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      select: { id: true, name: true, type: true, party: true, state: true },
      orderBy: { name: "asc" },
      take: 10000,
    }),
    prisma.ciEntitySubscription.findMany({ where: { clientId }, select: { entityId: true } }),
  ])
  const followedIds = new Set<string>(
    subscriptions.map((subscription: { entityId: string }) => subscription.entityId),
  )
  return entities
    .map((entity: Omit<MobileFeedEntityOption, "isFollowing">) => ({
      ...entity,
      isFollowing: followedIds.has(entity.id),
    }))
    .sort(
      (a: MobileFeedEntityOption, b: MobileFeedEntityOption) =>
        Number(b.isFollowing) - Number(a.isFollowing) || a.name.localeCompare(b.name),
    )
}

/**
 * Cursor-paginated feed for the mobile app. Matches the access model of the existing
 * web Competitive Insights feed (app/api/competitive-insights/route.ts) exactly:
 * only campaigns/messages assigned to a tracked, non-data-broker entity are visible
 * (`entityId IS NOT NULL`) — there is no `clientId`-based branch here at all, so a
 * client's own *unassigned* personal captures (and, by construction, every other
 * client's) are never exposed through this shared feed. Personal records remain
 * reachable only via getFeedItemById's clientId-owned branch (single-item detail).
 *
 * Every filter is combined with an explicit top-level `AND: [...]` array rather than
 * spreading multiple `{ OR: [...] }` fragments into the same object — the latter is
 * what silently dropped the access-scope clause in the original implementation
 * whenever a search or cursor condition was also present (each spread `OR` key
 * clobbers the previous one; only the last one applied).
 */
export async function getFeedPage(
  clientId: string,
  plan: SubscriptionPlan,
  filters: FeedFilters,
  cursor: FeedCursor | null,
): Promise<{ items: FeedItem[]; nextCursor: string | null; hasMore: boolean }> {
  const [dateFloor, entityIdRestriction, ownershipFilters] = await Promise.all([
    getDateFloor(clientId, plan),
    resolveEntityIdRestriction(clientId, filters),
    resolveOwnershipWhere(filters),
  ])
  const dateBounds = getDateBounds(dateFloor, filters)

  // A tag/subscriptionsOnly filter that resolves to zero entities means the feed is
  // empty by definition — short-circuit instead of running a query that Prisma would
  // (correctly) also turn up empty, and skip it for both message types.
  if (entityIdRestriction !== null && entityIdRestriction.length === 0) {
    return { items: [], nextCursor: null, hasMore: false }
  }

  const entityWhere = entityAttributeWhere(filters)
  const emailPlatformFilter = emailPlatformWhere(filters.donationPlatform)
  const smsPlatformFilter = smsPlatformWhere(filters.donationPlatform)

  const searchWhereEmail = filters.search
    ? {
        OR: [
          { subject: { contains: filters.search, mode: "insensitive" as const } },
          { senderName: { contains: filters.search, mode: "insensitive" as const } },
          { senderEmail: { contains: filters.search, mode: "insensitive" as const } },
          { emailContent: { contains: filters.search, mode: "insensitive" as const } },
        ],
      }
    : null

  const searchWhereSms = filters.search
    ? {
        OR: [
          { message: { contains: filters.search, mode: "insensitive" as const } },
          { phoneNumber: { contains: filters.search } },
          { toNumber: { contains: filters.search } },
        ],
      }
    : null

  const emailCursorWhere = cursor
    ? {
        OR: [
          { dateReceived: { lt: new Date(cursor.dateReceived) } },
          { dateReceived: new Date(cursor.dateReceived), id: { lt: cursor.id } },
        ],
      }
    : null

  const smsCursorWhere = cursor
    ? {
        OR: [
          { createdAt: { lt: new Date(cursor.dateReceived) } },
          { createdAt: new Date(cursor.dateReceived), id: { lt: cursor.id } },
        ],
      }
    : null

  // Prisma's nested filter types don't compose well with conditionally-included AND
  // branches; matches the `any` typing already used for this shape throughout the
  // rest of the codebase (e.g. app/api/competitive-insights/route.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const emailWhere: any = {
    AND: [
      { isHidden: false },
      { isDeleted: false },
      { entityId: { not: null } },
      { entity: entityWhere },
      entityIdRestriction ? { entityId: { in: entityIdRestriction } } : {},
      dateBounds ? { dateReceived: dateBounds } : {},
      ownershipFilters.email ?? {},
      emailPlatformFilter ?? {},
      emailCursorWhere ?? {},
      searchWhereEmail ?? {},
    ],
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see emailWhere above.
  const smsWhere: any = {
    AND: [
      { isHidden: false },
      { isDeleted: false },
      { processed: true },
      { entityId: { not: null } },
      { entity: entityWhere },
      entityIdRestriction ? { entityId: { in: entityIdRestriction } } : {},
      dateBounds ? { createdAt: dateBounds } : {},
      ownershipFilters.sms ?? {},
      smsPlatformFilter ?? {},
      smsCursorWhere ?? {},
      searchWhereSms ?? {},
    ],
  }

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
    ...emailRows.map((c: (typeof emailRows)[number]) => ({
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
    ...smsRows.map((s: (typeof smsRows)[number]) => ({
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
  plan: SubscriptionPlan,
  id: string,
  type: "email" | "sms",
): Promise<
  (FeedItem & { emailContent?: string | null; emailPreview?: string | null; ctaLinks?: unknown[] }) | null
> {
  const dateFloor = await getDateFloor(clientId, plan)

  if (type === "email") {
    const campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { id },
      include: { entity: { select: { id: true, name: true, type: true, party: true, state: true } } },
    })
    if (!campaign || campaign.isDeleted || campaign.isHidden) return null
    if (dateFloor && campaign.dateReceived < dateFloor) return null

    // Same access model as the feed listing: any campaign assigned to a tracked,
    // non-data-broker entity is shared (visible to any client), OR it's one of the
    // caller's own personal (unassigned) captures. Never another client's personal
    // record.
    const isShared = campaign.entityId !== null && campaign.entity?.type !== "data_broker"
    const isOwnPersonal = campaign.clientId === clientId
    if (!isShared && !isOwnPersonal) return null

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
  // Unprocessed SMS has no reliable extracted content/sender yet — treat it the same
  // as "not found" rather than exposing a half-parsed row.
  if (!sms.processed) return null
  if (dateFloor && sms.createdAt < dateFloor) return null

  const isShared = sms.entityId !== null && sms.entity?.type !== "data_broker"
  const isOwnPersonal = sms.clientId === clientId
  if (!isShared && !isOwnPersonal) return null

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
