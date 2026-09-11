import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import { getMobileClientEntitlements } from "@/lib/services/mobile-entitlements"

export type MobileAlertCandidate = {
  id: string
  type: "email" | "sms"
  senderName: string
  subject: string
  preview: string
  entityId: string
  entityName: string
  entityParty: string | null
  entityState: string | null
  entityType: string
  isThirdParty: boolean | null
  donationPlatform: string | null
  /** Non-null for a client's private capture; null for the shared seed feed. */
  sourceClientId: string | null
}

type MatchableAlert = {
  search: string | null
  entityIds: string[]
  party: string | null
  state: string | null
  entityType: string | null
  messageTypes: string[]
  ownershipTypes: string[]
  donationPlatform: string | null
  subscriptionsOnly: boolean
  tag: string | null
}

type MobileAlertRecord = Prisma.CampaignAlertSubscriptionGetPayload<{
  include: {
    user: {
      select: {
        client: {
          select: {
            id: true
            active: true
            subscriptionPlan: true
            subscriptionStatus: true
            hasCompetitiveInsights: true
          }
        }
        mobilePushTokens: { where: { enabled: true } }
      }
    }
  }
}>

type PushTokenRecord = {
  id: string
  expoPushToken: string
}

type PushRecipient = {
  tokens: Map<string, PushTokenRecord>
  matchedAlertIds: Set<string>
}

export function candidateIsVisibleToClient(candidate: MobileAlertCandidate, clientId: string): boolean {
  return candidate.sourceClientId === null || candidate.sourceClientId === clientId
}

function normalizedParty(value: string | null): string {
  const party = value?.trim().toLowerCase() || ""
  return ["ind", "i", "third party"].includes(party) ? "independent" : party
}

export function matchesMobileAlert(
  alert: MatchableAlert,
  candidate: MobileAlertCandidate,
  clientFollowsEntity: boolean,
  clientTagsForEntity: ReadonlySet<string>,
): boolean {
  if (alert.entityIds.length && !alert.entityIds.includes(candidate.entityId)) return false
  if (alert.party && normalizedParty(alert.party) !== normalizedParty(candidate.entityParty)) return false
  if (alert.state && alert.state.toLowerCase() !== candidate.entityState?.toLowerCase()) return false
  if (alert.entityType && alert.entityType.toLowerCase() !== candidate.entityType.toLowerCase()) return false
  if (alert.messageTypes.length && !alert.messageTypes.includes(candidate.type)) return false

  const ownership = candidate.isThirdParty === true ? "third_party" : "house_file"
  if (alert.ownershipTypes.length && !alert.ownershipTypes.includes(ownership)) return false
  if (
    alert.donationPlatform &&
    alert.donationPlatform.toLowerCase() !== candidate.donationPlatform?.toLowerCase()
  ) return false
  if (alert.subscriptionsOnly && !clientFollowsEntity) return false
  if (alert.tag && !clientTagsForEntity.has(alert.tag.toLowerCase())) return false

  if (alert.search) {
    const needle = alert.search.toLowerCase()
    const haystack = `${candidate.entityName} ${candidate.senderName} ${candidate.subject} ${candidate.preview}`.toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

type ExpoTicket = {
  status: "ok" | "error"
  id?: string
  details?: { error?: string }
}

async function sendExpoPush(messages: Array<Record<string, unknown>>): Promise<ExpoTicket[]> {
  let delay = 250
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(8_000),
      })
      if (response.ok) {
        const body = await response.json() as { data?: ExpoTicket[] }
        return body.data || []
      }
      if (response.status < 500 && response.status !== 429) break
    } catch {
      // Retry temporary network failures without logging tokens or payload contents.
    }
    await new Promise((resolve) => setTimeout(resolve, delay))
    delay *= 2
  }
  throw new Error("Expo push service did not accept the notification batch")
}

/**
 * Sends at most one push per user for a newly ingested CI item, even when several
 * of that user's alerts match. Failures never roll back message ingestion.
 */
export async function notifyMobileAlertsForMessage(candidate: MobileAlertCandidate): Promise<void> {
  if (!candidate.entityId || candidate.entityType.toLowerCase() === "data_broker") return

  const alerts = await prisma.campaignAlertSubscription.findMany({
    where: { kind: "ci_message", enabled: true },
    include: {
      user: {
        select: {
          client: {
            select: {
              id: true,
              active: true,
              subscriptionPlan: true,
              subscriptionStatus: true,
              hasCompetitiveInsights: true,
            },
          },
          mobilePushTokens: { where: { enabled: true } },
        },
      },
    },
  }) as MobileAlertRecord[]

  const clientIds = [...new Set(alerts.map((alert) => alert.clientId).filter((id): id is string => Boolean(id)))]
  const [subscriptions, entityTags] = await Promise.all([
    prisma.ciEntitySubscription.findMany({
      where: { clientId: { in: clientIds }, entityId: candidate.entityId },
      select: { clientId: true },
    }),
    prisma.entityTag.findMany({
      where: { clientId: { in: clientIds }, entityId: candidate.entityId },
      select: { clientId: true, tagName: true },
    }),
  ]) as [{ clientId: string }[], { clientId: string; tagName: string }[]]
  const followingClients = new Set(subscriptions.map(({ clientId }) => clientId))
  const tagsByClient = new Map<string, Set<string>>()
  for (const { clientId, tagName } of entityTags) {
    const tags = tagsByClient.get(clientId) || new Set<string>()
    tags.add(tagName.toLowerCase())
    tagsByClient.set(clientId, tags)
  }

  const recipients = new Map<string, PushRecipient>()
  const addRecipient = (userId: string, tokens: PushTokenRecord[], alertId?: string) => {
    const recipient = recipients.get(userId) || {
      tokens: new Map<string, PushTokenRecord>(),
      matchedAlertIds: new Set<string>(),
    }
    for (const token of tokens) recipient.tokens.set(token.id, token)
    if (alertId) recipient.matchedAlertIds.add(alertId)
    recipients.set(userId, recipient)
  }

  for (const alert of alerts) {
    const client = alert.user.client
    if (
      !client ||
      alert.clientId !== client.id ||
      !client.active ||
      client.subscriptionStatus !== "active" ||
      !client.hasCompetitiveInsights ||
      !getMobileClientEntitlements(client.subscriptionPlan).canUseAlerts ||
      alert.user.mobilePushTokens.length === 0 ||
      !candidateIsVisibleToClient(candidate, client.id)
    ) continue

    if (matchesMobileAlert(
      alert,
      candidate,
      followingClients.has(client.id),
      tagsByClient.get(client.id) || new Set(),
    )) {
      addRecipient(alert.userId, alert.user.mobilePushTokens, alert.id)
    }
  }

  // The Following switch is intentionally independent from paid custom alerts.
  // Every user whose active client follows this entity may opt in on each iPhone.
  const followed = await prisma.ciEntitySubscription.findMany({
    where: {
      entityId: candidate.entityId,
      ...(candidate.sourceClientId ? { clientId: candidate.sourceClientId } : {}),
    },
    select: { clientId: true },
  }) as { clientId: string }[]
  const followedClientIds = [...new Set(followed.map(({ clientId }) => clientId))]
  if (followedClientIds.length) {
    const clients = await prisma.client.findMany({
      where: {
        id: { in: followedClientIds },
        active: true,
        hasCompetitiveInsights: true,
        OR: [
          { subscriptionStatus: "active" },
          { subscriptionPlan: "free" },
        ],
      },
      select: {
        id: true,
        users: {
          where: { firstLogin: false },
          select: {
            id: true,
            mobilePushTokens: {
              where: { enabled: true, followingEnabled: true },
              select: { id: true, expoPushToken: true },
            },
          },
        },
      },
    })
    for (const client of clients) {
      if (!candidateIsVisibleToClient(candidate, client.id)) continue
      for (const user of client.users) {
        if (user.mobilePushTokens.length) addRecipient(user.id, user.mobilePushTokens)
      }
    }
  }

  const prepared: { deliveryId: string; tokens: PushTokenRecord[] }[] = []
  for (const [userId, recipient] of recipients) {
    let delivery: { id: string }
    try {
      delivery = await prisma.mobileAlertDelivery.create({
        data: {
          userId,
          sourceType: candidate.type,
          sourceId: candidate.id,
          matchedAlertIds: [...recipient.matchedAlertIds],
        },
        select: { id: true },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue
      throw error
    }

    prepared.push({ deliveryId: delivery.id, tokens: [...recipient.tokens.values()].slice(0, 100) })
  }

  type PushJob = {
    deliveryId: string
    tokenId: string
    message: Record<string, unknown>
  }
  const jobs: PushJob[] = prepared.flatMap(({ deliveryId, tokens }) =>
    tokens.map(({ id, expoPushToken }) => ({
      deliveryId,
      tokenId: id,
      message: {
        to: expoPushToken,
        sound: "default",
        title: `${candidate.entityName} sent ${candidate.type === "email" ? "an email" : "an SMS"}`,
        body: candidate.type === "email" ? candidate.subject : candidate.preview.slice(0, 180),
        data: { feedItemId: candidate.id, messageType: candidate.type },
      },
    })),
  )
  const ticketsByDelivery = new Map<string, ExpoTicket[]>()
  const networkFailedDeliveries = new Set<string>()
  const invalidTokenIds = new Set<string>()

  for (let offset = 0; offset < jobs.length; offset += 100) {
    const chunk = jobs.slice(offset, offset + 100)
    try {
      const tickets = await sendExpoPush(chunk.map(({ message }) => message))
      chunk.forEach((job, index) => {
        const ticket = tickets[index]
        if (!ticket) return
        const deliveryTickets = ticketsByDelivery.get(job.deliveryId) || []
        deliveryTickets.push(ticket)
        ticketsByDelivery.set(job.deliveryId, deliveryTickets)
        if (ticket.details?.error === "DeviceNotRegistered") invalidTokenIds.add(job.tokenId)
      })
    } catch {
      chunk.forEach(({ deliveryId }) => networkFailedDeliveries.add(deliveryId))
    }
  }

  if (invalidTokenIds.size) {
    await prisma.mobilePushToken.updateMany({
      where: { id: { in: [...invalidTokenIds] } },
      data: { enabled: false },
    })
  }

  await Promise.all(prepared.map(({ deliveryId }) => {
    const tickets = ticketsByDelivery.get(deliveryId) || []
    const sent = tickets.some((ticket) => ticket.status === "ok")
    return prisma.mobileAlertDelivery.update({
      where: { id: deliveryId },
      data: {
        status: sent ? "sent" : "failed",
        expoTicketIds: tickets.flatMap((ticket) => ticket.id ? [ticket.id] : []),
        error: sent
          ? null
          : networkFailedDeliveries.has(deliveryId)
            ? "Push delivery failed"
            : "Push tickets were rejected",
      },
    })
  }))
}
