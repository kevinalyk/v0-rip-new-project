import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"
import { updateClientSlackBotSeats } from "@/lib/stripe-slack-bots"
import { SLACK_MULTI_BOT_ENABLED } from "@/lib/feature-flags"
import {
  isValidMessageTypeFilter,
  isValidHouseFileFilter,
  isValidPartyFilter,
  isValidStateFilter,
  isValidEntityTypeFilter,
} from "@/lib/slack-message-filters"

// Fully wired but hidden behind SLACK_MULTI_BOT_ENABLED until launch. See app/api/slack/bots/route.ts.

async function getOwnedBot(clientId: string, botId: string) {
  return prisma.slackChannel.findFirst({
    where: { id: botId, clientId },
    include: { slackIntegration: { select: { botAccessToken: true } } },
  })
}

// Finalizes channel selection for this bot (join channel, post confirmation, mark
// "connected") when { channelId, channelName } is sent, or toggles the per-alert-type
// notification switch when { notifyOnFollowedEntityMessages } is sent.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!SLACK_MULTI_BOT_ENABLED) {
    return NextResponse.json({ error: "Not available." }, { status: 403 })
  }

  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canManageSlackIntegration(userRecord.role)) {
    return NextResponse.json(
      { error: "Only account Owners or Admins can configure a Slack bot." },
      { status: 403 },
    )
  }

  const { id } = await params
  const clientId = userRecord.clientId as string
  const bot = await getOwnedBot(clientId, id)

  if (!bot) {
    return NextResponse.json({ error: "Bot not found." }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))

  if (typeof body.notifyOnFollowedEntityMessages === "boolean") {
    const updated = await prisma.slackChannel.update({
      where: { id: bot.id },
      data: { notifyOnFollowedEntityMessages: body.notifyOnFollowedEntityMessages },
    })
    return NextResponse.json({ bot: updated })
  }

  // Message-level filters (channel, house file/third party, party, state, entity type) -
  // same dimensions and validation as the primary integration's /api/slack/message-filters.
  // Only the fields present in the body are updated.
  const messageFilterKeys = [
    "messageTypeFilter",
    "houseFileFilter",
    "partyFilter",
    "stateFilter",
    "entityTypeFilter",
  ] as const
  if (messageFilterKeys.some((key) => key in body)) {
    const data: Record<string, string> = {}

    if ("messageTypeFilter" in body) {
      if (!isValidMessageTypeFilter(body.messageTypeFilter)) {
        return NextResponse.json({ error: "Invalid messageTypeFilter" }, { status: 400 })
      }
      data.messageTypeFilter = body.messageTypeFilter
    }
    if ("houseFileFilter" in body) {
      if (!isValidHouseFileFilter(body.houseFileFilter)) {
        return NextResponse.json({ error: "Invalid houseFileFilter" }, { status: 400 })
      }
      data.houseFileFilter = body.houseFileFilter
    }
    if ("partyFilter" in body) {
      if (!isValidPartyFilter(body.partyFilter)) {
        return NextResponse.json({ error: "Invalid partyFilter" }, { status: 400 })
      }
      data.partyFilter = body.partyFilter
    }
    if ("stateFilter" in body) {
      if (!isValidStateFilter(body.stateFilter)) {
        return NextResponse.json({ error: "Invalid stateFilter" }, { status: 400 })
      }
      data.stateFilter = body.stateFilter
    }
    if ("entityTypeFilter" in body) {
      if (!isValidEntityTypeFilter(body.entityTypeFilter)) {
        return NextResponse.json({ error: "Invalid entityTypeFilter" }, { status: 400 })
      }
      data.entityTypeFilter = body.entityTypeFilter
    }

    const updated = await prisma.slackChannel.update({ where: { id: bot.id }, data })
    return NextResponse.json({ bot: updated })
  }

  const { channelId, channelName } = body
  if (!channelId || !channelName) {
    return NextResponse.json(
      { error: "channelId and channelName (or notifyOnFollowedEntityMessages) are required" },
      { status: 400 },
    )
  }

  if (!bot.slackIntegration.botAccessToken) {
    return NextResponse.json({ error: "Slack is not connected yet." }, { status: 400 })
  }

  try {
    const botToken = decrypt(bot.slackIntegration.botAccessToken)

    const joinResponse = await fetch("https://slack.com/api/conversations.join", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({ channel: channelId }),
    })
    const joinData = await joinResponse.json()

    if (!joinData.ok) {
      console.error("[v0] Slack conversations.join error:", joinData.error)
      return NextResponse.json(
        { error: "Could not join that channel. Choose a public channel and try again." },
        { status: 502 },
      )
    }

    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        channel: channelId,
        text: "RIP Tool is now connected to this channel. Alerts for your organization will be posted here.",
      }),
    })

    const updated = await prisma.slackChannel.update({
      where: { id: bot.id },
      data: {
        channelId,
        channelName,
        status: "connected",
        connectedByUserId: userRecord.id,
        connectedAt: new Date(),
      },
    })

    return NextResponse.json({ bot: updated })
  } catch (error) {
    console.error("[v0] Error finalizing Slack bot channel selection:", error)
    return NextResponse.json({ error: "Failed to connect the Slack channel." }, { status: 500 })
  }
}

// Removes an add-on bot entirely (does not revoke the shared workspace token - the primary
// integration and any other add-on bots keep working) and immediately updates the Stripe
// subscription quantity, crediting the client for the removed seat.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!SLACK_MULTI_BOT_ENABLED) {
    return NextResponse.json({ error: "Not available." }, { status: 403 })
  }

  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canManageSlackIntegration(userRecord.role)) {
    return NextResponse.json(
      { error: "Only account Owners or Admins can remove a Slack bot." },
      { status: 403 },
    )
  }

  const { id } = await params
  const clientId = userRecord.clientId as string
  const bot = await getOwnedBot(clientId, id)

  if (!bot) {
    return NextResponse.json({ error: "Bot not found." }, { status: 404 })
  }

  await prisma.slackChannel.update({
    where: { id: bot.id },
    data: { status: "disconnected", disconnectedAt: new Date() },
  })

  try {
    await updateClientSlackBotSeats(clientId)
  } catch (error) {
    console.error("[v0] Error updating billing after Slack bot removal:", error)
  }

  return NextResponse.json({ success: true })
}
