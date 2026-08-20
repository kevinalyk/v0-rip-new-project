import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

interface NotifyNewEmailParams {
  kind: "email"
  entityId: string
  entityName: string
  senderName: string
  senderEmail: string
  subject: string
  shareToken: string
}

interface NotifyNewSmsParams {
  kind: "sms"
  entityId: string
  entityName: string
  phoneNumber: string | null
  message: string | null
  shareToken: string
}

type NotifyParams = NotifyNewEmailParams | NotifyNewSmsParams

/**
 * Posts a real-time Slack alert to every client following `entityId` (via
 * CiEntitySubscription) whose Slack integration is connected. Call this the
 * moment a message's entityId becomes non-null - at ingestion, on manual
 * assignment, or from the auto-assign cron. Never throws: a Slack failure
 * (revoked token, rate limit, etc.) must not block the caller's write path.
 */
export async function notifyFollowersOfNewMessage(params: NotifyParams): Promise<void> {
  try {
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
    const integrations = await prisma.slackIntegration.findMany({
      where: { clientId: { in: clientIds }, status: "connected", notifyOnFollowedEntityMessages: true },
    })

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
