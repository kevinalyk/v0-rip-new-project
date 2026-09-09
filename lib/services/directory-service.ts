import type { Prisma } from "@prisma/client"

import { MobileAuthError } from "@/lib/mobile-auth"
import prisma from "@/lib/prisma"
import { getMobileFeedDateFloor } from "@/lib/services/feed-service"
import type { SubscriptionPlan } from "@/lib/subscription-utils"

export const MOBILE_DIRECTORY_PARTIES = [
  { value: "republican", label: "Republican" },
  { value: "democrat", label: "Democrat" },
  { value: "independent", label: "Independent" },
  { value: "unknown", label: "Unknown" },
] as const

export const MOBILE_DIRECTORY_ENTITY_TYPES = [
  { value: "candidate", label: "Candidates" },
  { value: "politician", label: "Politicians" },
  { value: "pac", label: "PACs" },
  { value: "organization", label: "Organizations" },
  { value: "nonprofit", label: "Nonprofits" },
  { value: "jfc", label: "JFCs" },
] as const

export interface DirectoryFilters {
  search?: string
  party?: string
  state?: string
  entityType?: string
}

export interface DirectoryCursor {
  offset: number
}

const PAGE_SIZE = 30

const directoryListSelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  party: true,
  state: true,
  imageUrl: true,
  office: true,
  _count: { select: { campaigns: true, smsMessages: true } },
  subscriptions: { select: { id: true } },
} satisfies Prisma.CiEntitySelect

const directoryDetailSelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  party: true,
  state: true,
  imageUrl: true,
  bio: true,
  office: true,
  ballotpediaUrl: true,
  mappings: { select: { senderEmail: true, senderDomain: true, senderPhone: true } },
  _count: { select: { campaigns: true, smsMessages: true } },
  subscriptions: { select: { id: true } },
} satisfies Prisma.CiEntitySelect

const recentEmailSelect = {
  id: true,
  subject: true,
  senderEmail: true,
  dateReceived: true,
} satisfies Prisma.CompetitiveInsightCampaignSelect

const recentSmsSelect = {
  id: true,
  message: true,
  phoneNumber: true,
  createdAt: true,
} satisfies Prisma.SmsQueueSelect

type DirectoryListRow = Prisma.CiEntityGetPayload<{ select: typeof directoryListSelect }>
type DirectoryDetailRow = Prisma.CiEntityGetPayload<{ select: typeof directoryDetailSelect }>
type RecentEmailRow = Prisma.CompetitiveInsightCampaignGetPayload<{ select: typeof recentEmailSelect }>
type RecentSmsRow = Prisma.SmsQueueGetPayload<{ select: typeof recentSmsSelect }>

export function encodeDirectoryCursor(cursor: DirectoryCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url")
}

export function decodeDirectoryCursor(raw: string | null | undefined): DirectoryCursor | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf-8"))
    if (parsed && Number.isSafeInteger(parsed.offset) && parsed.offset > 0) {
      return { offset: parsed.offset }
    }
  } catch {
    // Fall through to the shared invalid-cursor response below.
  }
  throw new MobileAuthError(400, "INVALID_CURSOR", "The provided cursor is malformed")
}

function partyWhere(party: string | undefined): Prisma.CiEntityWhereInput | null {
  if (!party) return null
  if (party === "unknown") return { party: null }
  if (party === "independent") {
    return {
      OR: ["independent", "third party", "ind", "i"].map((value) => ({
        party: { equals: value, mode: "insensitive" as const },
      })),
    }
  }
  return { party: { equals: party, mode: "insensitive" } }
}

function directoryWhere(filters: DirectoryFilters): Prisma.CiEntityWhereInput {
  return {
    AND: [
      { type: { not: "data_broker" } },
      filters.search ? { name: { contains: filters.search, mode: "insensitive" } } : {},
      partyWhere(filters.party) ?? {},
      filters.state === "unknown"
        ? { state: null }
        : filters.state
          ? { state: { equals: filters.state, mode: "insensitive" } }
          : {},
      filters.entityType ? { type: { equals: filters.entityType, mode: "insensitive" } } : {},
    ],
  }
}

export async function listDirectoryEntities(
  clientId: string,
  filters: DirectoryFilters,
  cursor: DirectoryCursor | null,
) {
  const offset = cursor?.offset ?? 0
  const where = directoryWhere(filters)

  const [rows, totalCount] = (await Promise.all([
    prisma.ciEntity.findMany({
      where,
      select: {
        ...directoryListSelect,
        subscriptions: {
          where: { clientId },
          select: directoryListSelect.subscriptions.select,
          take: 1,
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip: offset,
      take: PAGE_SIZE + 1,
    }),
    prisma.ciEntity.count({ where }),
  ])) as [DirectoryListRow[], number]

  const hasMore = rows.length > PAGE_SIZE
  const page = rows.slice(0, PAGE_SIZE)
  return {
    entities: page.map(({ _count, subscriptions, ...entity }) => ({
      ...entity,
      isFollowing: subscriptions.length > 0,
      counts: {
        emails: _count.campaigns,
        sms: _count.smsMessages,
        total: _count.campaigns + _count.smsMessages,
      },
    })),
    totalCount,
    hasMore,
    nextCursor: hasMore ? encodeDirectoryCursor({ offset: offset + PAGE_SIZE }) : null,
  }
}

export async function getDirectoryEntity(
  clientId: string,
  plan: SubscriptionPlan,
  entityId: string,
) {
  const entity = (await prisma.ciEntity.findFirst({
    where: { id: entityId, type: { not: "data_broker" } },
    select: {
      ...directoryDetailSelect,
      subscriptions: {
        where: { clientId },
        select: directoryDetailSelect.subscriptions.select,
        take: 1,
      },
    },
  })) as DirectoryDetailRow | null
  if (!entity) throw new MobileAuthError(404, "ENTITY_NOT_FOUND", "Entity not found")

  const dateFloor = await getMobileFeedDateFloor(clientId, plan)
  const [emails, smsMessages] = (await Promise.all([
    prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId,
        isDeleted: false,
        isHidden: false,
        ...(dateFloor ? { dateReceived: { gte: dateFloor } } : {}),
      },
      select: recentEmailSelect,
      orderBy: [{ dateReceived: "desc" }, { id: "desc" }],
      take: 10,
    }),
    prisma.smsQueue.findMany({
      where: {
        entityId,
        processed: true,
        isDeleted: false,
        isHidden: false,
        ...(dateFloor ? { createdAt: { gte: dateFloor } } : {}),
      },
      select: recentSmsSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
    }),
  ])) as [RecentEmailRow[], RecentSmsRow[]]

  const recentMessages = [
    ...emails.map((message) => ({
      id: message.id,
      type: "email" as const,
      title: message.subject || "No subject",
      sender: message.senderEmail,
      dateReceived: message.dateReceived.toISOString(),
    })),
    ...smsMessages.map((message) => ({
      id: message.id,
      type: "sms" as const,
      title: message.message?.slice(0, 140) || "SMS message",
      sender: message.phoneNumber || "Unknown sender",
      dateReceived: message.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => (a.dateReceived < b.dateReceived ? 1 : -1))
    .slice(0, 10)

  const emailSenders = [
    ...new Set(
      entity.mappings
        .map((mapping) => mapping.senderEmail || mapping.senderDomain)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
  const smsSenders = [
    ...new Set(
      entity.mappings
        .map((mapping) => mapping.senderPhone)
        .filter((value): value is string => Boolean(value)),
    ),
  ]

  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    description: entity.description,
    party: entity.party,
    state: entity.state,
    imageUrl: entity.imageUrl,
    bio: entity.bio,
    office: entity.office,
    ballotpediaUrl: entity.ballotpediaUrl,
    isFollowing: entity.subscriptions.length > 0,
    counts: {
      emails: entity._count.campaigns,
      sms: entity._count.smsMessages,
      total: entity._count.campaigns + entity._count.smsMessages,
    },
    emailSenders,
    smsSenders,
    recentMessages,
  }
}
