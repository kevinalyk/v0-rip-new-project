import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

// entityId only becomes non-null well after a message actually arrived in several
// paths: the twice-daily auto-assign-unassigned cron sweeps a backlog of anything
// left unassigned, and manual "assign this sender to entity X" retroactively
// touches every historical unassigned message from that sender/domain/phone. Both
// call this same function, so without a recency check they'd alert on day-old (or
// older) backlog as if it "just happened." Anything older than this window is
// treated as backlog catch-up: it still gets assigned, just not alerted on.
const ALERT_FRESHNESS_WINDOW_MS = 3 * 60 * 60 * 1000 // 3 hours

interface NotifyNewEmailParams {
  kind: "email"
  entityId: string
  entityName: string
  senderName: string
  senderEmail: string
  subject: string
  shareToken: string
  /** When the message actually arrived (e.g. campaign.dateReceived / sms.createdAt) - NOT when it was assigned/detected. */
  occurredAt: Date
}

interface NotifyNewSmsParams {
  kind: "sms"
  entityId: string
  entityName: string
  phoneNumber: string | null
  message: string | null
  shareToken: string
  /** When the message actually arrived (e.g. campaign.dateReceived / sms.createdAt) - NOT when it was assigned/detected. */
  occurredAt: Date
}

type NotifyParams = NotifyNewEmailParams | NotifyNewSmsParams

/**
 * Posts a real-time Slack alert to every client following `entityId` (via
 * CiEntitySubscription) whose Slack integration is connected. Call this the
 * moment a message's entityId becomes non-null - at ingestion, on manual
 * assignment, or from the auto-assign cron. Never throws: a Slack failure
 * (revoked token, rate limit, etc.) must not block the caller's write path.
 *
 * Skips sending (but the caller should still keep the assignment) if
 * `params.occurredAt` is older than ALERT_FRESHNESS_WINDOW_MS - this is what
 * prevents backlog catch-up (cron sweeps, retroactive manual assignment) from
 * alerting on messages that arrived hours or days ago as if they were live.
 */
export async function notifyFollowersOfNewMessage(params: NotifyParams): Promise<void> {
  try {
    const ageMs = Date.now() - params.occurredAt.getTime()
    if (ageMs > ALERT_FRESHNESS_WINDOW_MS) {
      console.log(
        `[v0] Skipping Slack alert for stale message (occurred ${Math.round(ageMs / (60 * 60 * 1000))}h ago, entity ${params.entityId}) - backlog catch-up, not live`,
      )
      return
    }

    const subscriptions = await prisma.ciEntitySubscription.findMany({
      where: { entityId: params.entityId },
      select: { clientId: true },
      distinct: ["clientId"],
    })

    if (subscriptions.length === 0) return

    const clientIds = subscriptions.map((sub: { clientId: string }) => sub.clientId)

    // Only clients that are (a) actually connected and (b) have this specific alert
    // type toggled on receive the message. The toggle lives on the settings page so
    // a client can opt out of "followed entity" alerts without disconnecting Slack
    // entirely (e.g. once other alert types ship and they only want a subset).
    const candidateIntegrations = await prisma.slackIntegration.findMany({
      where: { clientId: { in: clientIds }, status: "connected", notifyOnFollowedEntityMessages: true },
    })

    if (candidateIntegrations.length === 0) return

    // Clients that have opted into entity filtering (entityFilterConfigured) only get
    // alerted when this message's entity is in their SlackEntityFilter selection.
    // Clients who haven't configured a filter keep the legacy behavior of alerting on
    // every followed entity, so this never silently changes existing workspaces.
    const filteredClientIds = candidateIntegrations
      .filter((integration: { entityFilterConfigured: boolean }) => integration.entityFilterConfigured)
      .map((integration: { clientId: string }) => integration.clientId)

    const allowedFilteredClientIds = new Set(
      filteredClientIds.length > 0
        ? (
            await prisma.slackEntityFilter.findMany({
              where: { clientId: { in: filteredClientIds }, entityId: params.entityId },
              select: { clientId: true },
            })
          ).map((f: { clientId: string }) => f.clientId)
        : [],
    )

    const integrations = candidateIntegrations.filter(
      (integration: { clientId: string; entityFilterConfigured: boolean }) =>
        !integration.entityFilterConfigured || allowedFilteredClientIds.has(integration.clientId),
    )

    if (integrations.length === 0) return

    const shareUrl = `${APP_URL}/share/${params.shareToken}`
    const text = buildSlackMessageText(params, shareUrl)

    await Promise.all(
      integrations.map((integration: { id: string; botAccessToken: string | null; channelId: string | null }) =>
        postSlackAlert(integration, text),
      ),
    )
  } catch (error) {
    console.error("[v0] Error notifying Slack followers of new message:", error)
  }
}

function buildSlackMessageText(params: NotifyParams, shareUrl: string): string {
  if (params.kind === "email") {
    const subject = params.subject.trim().length > 0 ? params.subject.trim() : "(no subject)"
    return [
      `New email from *${params.entityName}*`,
      `${params.senderName} <${params.senderEmail}>`,
      `"${truncate(subject, 200)}"`,
      `<${shareUrl}|View in RIP Tool>`,
    ].join("\n")
  }

  const preview = params.message?.trim() ? truncate(params.message.trim(), 200) : "(no message content)"
  return [
    `New text from *${params.entityName}*`,
    params.phoneNumber ?? "Unknown number",
    `"${preview}"`,
    `<${shareUrl}|View in RIP Tool>`,
  ].join("\n")
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

async function postSlackAlert(
  integration: { id: string; botAccessToken: string | null; channelId: string | null },
  text: string,
): Promise<void> {
  if (!integration.botAccessToken || !integration.channelId) return

  try {
    const botToken = decrypt(integration.botAccessToken)
    const response = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel: integration.channelId, text }),
    })

    const data = await response.json()
    if (!data.ok) {
      console.error(`[v0] Slack chat.postMessage failed for integration ${integration.id}:`, data.error)
    }
  } catch (error) {
    console.error(`[v0] Error posting Slack alert for integration ${integration.id}:`, error)
  }
}
