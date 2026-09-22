import { Prisma } from "@prisma/client"

import prisma from "@/lib/prisma"
import {
  getEffectiveMobileEntitlements,
  hasActiveApplePersonalSubscription,
} from "@/lib/services/mobile-entitlements"

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
        mobileSubscriptionPlan: true
        mobileSubscriptionStatus: true
        mobileSubscriptionExpiresAt: true
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
  userFollowsEntity: boolean,
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
  if (alert.subscriptionsOnly && !userFollowsEntity) return false
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

export function buildAnnouncementPushMessage(
  expoPushToken: string,
  announcement: { slug: string; title: string },
): Record<string, unknown> {
  return {
    to: expoPushToken,
    sound: "default",
    title: "What’s New in Inbox.GOP",
    body: announcement.title,
    data: { announcementSlug: announcement.slug },
  }
}

export type AccountAccessPushKind = "web_ready" | "covered"

export function buildAccountAccessPushMessage(
  expoPushToken: string,
  input: {
    kind: AccountAccessPushKind
    clientName: string
    planName?: string
    shouldCancelAppleSubscription: boolean
  },
): Record<string, unknown> {
  const covered = input.kind === "covered"
  return {
    to: expoPushToken,
    sound: "default",
    title: covered ? "Your mobile access is covered" : "Your web access is ready",
    body: covered
      ? input.shouldCancelAppleSubscription
        ? `${input.clientName}'s ${input.planName || "web"} plan now includes your mobile access. Cancel Personal through Apple to avoid paying twice.`
        : `${input.clientName}'s ${input.planName || "web"} plan now includes your full Inbox.GOP mobile access.`
      : `You can now use your free Inbox.GOP web workspace for ${input.clientName}.`,
    data: {
      accountAccessKind: input.kind,
      shouldCancelAppleSubscription: input.shouldCancelAppleSubscription,
    },
  }
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
          mobileSubscriptionPlan: true,
          mobileSubscriptionStatus: true,
          mobileSubscriptionExpiresAt: true,
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
      where: { userId: { in: alerts.map((alert) => alert.userId) }, entityId: candidate.entityId },
      select: { userId: true },
    }),
    prisma.entityTag.findMany({
      where: { clientId: { in: clientIds }, entityId: candidate.entityId },
      select: { clientId: true, tagName: true },
    }),
  ]) as [{ userId: string }[], { clientId: string; tagName: string }[]]
  const followingUsers = new Set(subscriptions.map(({ userId }) => userId))
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
    const entitlements = client
      ? getEffectiveMobileEntitlements(
          client.subscriptionPlan,
          client.subscriptionStatus,
          {
            plan: alert.user.mobileSubscriptionPlan,
            status: alert.user.mobileSubscriptionStatus,
            expiresAt: alert.user.mobileSubscriptionExpiresAt,
          },
        )
      : null
    if (
      !client ||
      alert.clientId !== client.id ||
      !client.active ||
      !client.hasCompetitiveInsights ||
      !entitlements?.canUseAlerts ||
      alert.user.mobilePushTokens.length === 0 ||
      !candidateIsVisibleToClient(candidate, client.id)
    ) continue

    if (matchesMobileAlert(
      alert,
      candidate,
      followingUsers.has(alert.userId),
      tagsByClient.get(client.id) || new Set(),
    )) {
      addRecipient(alert.userId, alert.user.mobilePushTokens, alert.id)
    }
  }

  // The Following switch is intentionally independent from paid custom alerts.
  // Every user who personally follows this entity may opt in on each iPhone.
  const followed = await prisma.ciEntitySubscription.findMany({
    where: {
      entityId: candidate.entityId,
      ...(candidate.sourceClientId ? { clientId: candidate.sourceClientId } : {}),
    },
    select: {
      clientId: true,
      user: {
        select: {
          id: true,
          firstLogin: true,
          client: {
            select: {
              id: true,
              active: true,
              hasCompetitiveInsights: true,
              subscriptionStatus: true,
              subscriptionPlan: true,
            },
          },
          mobilePushTokens: {
            where: { enabled: true, followingEnabled: true },
            select: { id: true, expoPushToken: true },
          },
        },
      },
    },
  })
  for (const subscription of followed) {
    const user = subscription.user
    const client = user.client
    if (
      user.firstLogin ||
      !client ||
      client.id !== subscription.clientId ||
      !client.active ||
      !client.hasCompetitiveInsights ||
      (client.subscriptionPlan !== "free" && client.subscriptionStatus !== "active") ||
      !candidateIsVisibleToClient(candidate, client.id)
    ) continue
    if (user.mobilePushTokens.length) addRecipient(user.id, user.mobilePushTokens)
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

/**
 * Notifies every eligible registered iPhone once when a product announcement is
 * created. MobileAlertDelivery's compound unique key makes retries idempotent per
 * user and announcement; editing an existing article does not notify again.
 */
export async function notifyMobileDevicesForAnnouncement(announcement: {
  id: string
  slug: string
  title: string
}): Promise<void> {
  const tokens = await prisma.mobilePushToken.findMany({
    where: {
      enabled: true,
      user: {
        firstLogin: false,
        productUpdateEnabled: true,
        client: { is: { active: true } },
      },
    },
    select: { id: true, userId: true, expoPushToken: true },
  })

  const tokensByUser = new Map<string, PushTokenRecord[]>()
  for (const token of tokens) {
    const userTokens = tokensByUser.get(token.userId) || []
    userTokens.push({ id: token.id, expoPushToken: token.expoPushToken })
    tokensByUser.set(token.userId, userTokens)
  }

  const prepared: { deliveryId: string; tokens: PushTokenRecord[] }[] = []
  for (const [userId, userTokens] of tokensByUser) {
    try {
      const delivery = await prisma.mobileAlertDelivery.create({
        data: {
          userId,
          sourceType: "announcement",
          sourceId: announcement.id,
        },
        select: { id: true },
      })
      prepared.push({ deliveryId: delivery.id, tokens: userTokens.slice(0, 100) })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue
      throw error
    }
  }

  const jobs = prepared.flatMap(({ deliveryId, tokens: deliveryTokens }) =>
    deliveryTokens.map(({ id: tokenId, expoPushToken }) => ({
      deliveryId,
      tokenId,
      message: buildAnnouncementPushMessage(expoPushToken, announcement),
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

/**
 * Sends an idempotent account-access notification to one user. `eventKey` is a
 * server-created identifier (for example `web-ready` or a Stripe subscription id),
 * never caller-controlled text. The delivery record prevents duplicate pushes when
 * Stripe retries a webhook or a user signs into the web app more than once.
 */
export async function notifyMobileAccountAccess(
  userId: string,
  eventKey: string,
  input: {
    kind: AccountAccessPushKind
    clientName: string
    planName?: string
  },
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      mobileSubscriptionPlan: true,
      mobileSubscriptionStatus: true,
      mobileSubscriptionExpiresAt: true,
      mobilePushTokens: {
        where: { enabled: true },
        select: { id: true, expoPushToken: true },
      },
    },
  })
  if (!user?.mobilePushTokens.length) return

  let delivery: { id: string }
  try {
    delivery = await prisma.mobileAlertDelivery.create({
      data: { userId, sourceType: "account_access", sourceId: eventKey },
      select: { id: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return
    throw error
  }

  const shouldCancelAppleSubscription = hasActiveApplePersonalSubscription({
    plan: user.mobileSubscriptionPlan,
    status: user.mobileSubscriptionStatus,
    expiresAt: user.mobileSubscriptionExpiresAt,
  })
  const tokens = user.mobilePushTokens.slice(0, 100)

  try {
    const tickets = await sendExpoPush(
      tokens.map(({ expoPushToken }: { expoPushToken: string }) =>
        buildAccountAccessPushMessage(expoPushToken, {
          ...input,
          shouldCancelAppleSubscription,
        }),
      ),
    )
    const invalidTokenIds = tickets.flatMap((ticket, index) =>
      ticket.details?.error === "DeviceNotRegistered" && tokens[index]?.id
        ? [tokens[index].id]
        : [],
    )
    if (invalidTokenIds.length) {
      await prisma.mobilePushToken.updateMany({
        where: { id: { in: invalidTokenIds } },
        data: { enabled: false },
      })
    }
    const sent = tickets.some((ticket) => ticket.status === "ok")
    await prisma.mobileAlertDelivery.update({
      where: { id: delivery.id },
      data: {
        status: sent ? "sent" : "failed",
        expoTicketIds: tickets.flatMap((ticket) => ticket.id ? [ticket.id] : []),
        error: sent ? null : "Push tickets were rejected",
      },
    })
  } catch {
    await prisma.mobileAlertDelivery.update({
      where: { id: delivery.id },
      data: { status: "failed", error: "Push delivery failed" },
    })
  }
}

export async function notifyClientUsersCoveredByWebPlan(
  clientId: string,
  eventKey: string,
  planName: string,
): Promise<void> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { name: true, users: { select: { id: true, firstLogin: true } } },
  })
  if (!client) return

  await Promise.all(
    client.users
      .filter((user: { firstLogin: boolean }) => !user.firstLogin)
      .map((user: { id: string }) =>
        notifyMobileAccountAccess(user.id, eventKey, {
          kind: "covered",
          clientName: client.name,
          planName,
        }),
      ),
  )
}
