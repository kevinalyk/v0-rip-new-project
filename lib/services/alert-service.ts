import prisma from "@/lib/prisma"
import { MobileAuthError } from "@/lib/mobile-auth"
import { PARTIES, STATES } from "@/lib/campaign-filter-options"
import {
  MOBILE_DONATION_PLATFORMS,
  MOBILE_ENTITY_TYPES,
  type MobileDonationPlatform,
} from "@/lib/services/feed-service"

export const MOBILE_ALERT_MESSAGE_TYPES = ["email", "sms"] as const
export const MOBILE_ALERT_OWNERSHIP_TYPES = ["house_file", "third_party"] as const

export type MobileCiAlertInput = {
  name?: string
  search?: string
  entityIds?: string[]
  party?: string
  state?: string
  entityType?: string
  messageTypes?: string[]
  ownershipTypes?: string[]
  donationPlatform?: string
  subscriptionsOnly?: boolean
  tag?: string
}

function cleanOptional(value: string | undefined, maxLength: number): string | null {
  const cleaned = value?.trim()
  if (!cleaned) return null
  if (cleaned.length > maxLength) throw new MobileAuthError(400, "INVALID_BODY", "An alert value is too long")
  return cleaned
}

function cleanEnumArray(values: string[] | undefined, allowed: readonly string[], label: string): string[] {
  const unique = [...new Set(values || [])]
  if (unique.some((value) => !allowed.includes(value))) {
    throw new MobileAuthError(400, "INVALID_BODY", `Unsupported ${label}`)
  }
  return unique.length === allowed.length ? [] : unique
}

export async function listAlerts(userId: string, clientId: string) {
  return prisma.campaignAlertSubscription.findMany({
    where: { userId, clientId, kind: "ci_message" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
}

export async function createAlert(userId: string, clientId: string, input: MobileCiAlertInput) {
  const name = cleanOptional(input.name, 80)
  if (!name) throw new MobileAuthError(400, "INVALID_BODY", "Alert name is required")

  const entityIds = [...new Set(input.entityIds || [])]
  if (entityIds.length > 100) throw new MobileAuthError(400, "INVALID_BODY", "Select no more than 100 entities")
  if (entityIds.length) {
    const validEntities = await prisma.ciEntity.count({
      where: { id: { in: entityIds }, type: { not: "data_broker" } },
    })
    if (validEntities !== entityIds.length) {
      throw new MobileAuthError(400, "INVALID_BODY", "One or more selected entities are unavailable")
    }
  }

  const entityType = cleanOptional(input.entityType, 50)
  if (entityType && !MOBILE_ENTITY_TYPES.some((option) => option.value === entityType)) {
    throw new MobileAuthError(400, "INVALID_BODY", "Unsupported entity type")
  }
  const donationPlatform = cleanOptional(input.donationPlatform, 50)
  if (
    donationPlatform &&
    !MOBILE_DONATION_PLATFORMS.some((option) => option.value === donationPlatform as MobileDonationPlatform)
  ) {
    throw new MobileAuthError(400, "INVALID_BODY", "Unsupported donation platform")
  }
  const party = cleanOptional(input.party, 50)
  if (party && !PARTIES.some((option) => option.value === party)) {
    throw new MobileAuthError(400, "INVALID_BODY", "Unsupported party")
  }
  const state = cleanOptional(input.state, 10)
  if (state && !STATES.includes(state)) {
    throw new MobileAuthError(400, "INVALID_BODY", "Unsupported state")
  }
  const requestedTag = cleanOptional(input.tag, 50)
  const tag = requestedTag
    ? await prisma.entityTag.findFirst({
        where: { clientId, tagName: { equals: requestedTag, mode: "insensitive" } },
        select: { tagName: true },
      })
    : null
  if (requestedTag && !tag) throw new MobileAuthError(400, "INVALID_BODY", "Unknown entity tag")

  return prisma.campaignAlertSubscription.create({
    data: {
      userId,
      clientId,
      kind: "ci_message",
      name,
      search: cleanOptional(input.search, 100),
      entityIds,
      party,
      state,
      entityType,
      messageTypes: cleanEnumArray(input.messageTypes, MOBILE_ALERT_MESSAGE_TYPES, "message type"),
      ownershipTypes: cleanEnumArray(input.ownershipTypes, MOBILE_ALERT_OWNERSHIP_TYPES, "message source"),
      donationPlatform,
      subscriptionsOnly: input.subscriptionsOnly === true,
      tag: tag?.tagName || null,
      enabled: true,
    },
  })
}

export async function deleteAlert(userId: string, alertId: string) {
  const existing = await prisma.campaignAlertSubscription.findUnique({
    where: { id: alertId },
    select: { userId: true, kind: true },
  })
  if (!existing || existing.kind !== "ci_message") {
    throw new MobileAuthError(404, "ALERT_NOT_FOUND", "Alert not found")
  }
  if (existing.userId !== userId) {
    throw new MobileAuthError(403, "FORBIDDEN", "You do not have access to this alert")
  }
  await prisma.campaignAlertSubscription.delete({ where: { id: alertId } })
}
