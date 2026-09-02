import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"
import { updateClientSlackBotSeats, ADDITIONAL_SLACK_BOT_PRICE } from "@/lib/stripe-slack-bots"
import { SLACK_MULTI_BOT_ENABLED } from "@/lib/feature-flags"

// Additional (paid, $50/mo add-on) Slack bot channels, on top of the one free bot on
// SlackIntegration. Fully wired but hidden behind SLACK_MULTI_BOT_ENABLED until launch - every
// route here 403s while the flag is off, so there is no way to reach this feature from the UI
// or the API today.

// Lists the client's add-on bot channels (never includes the free primary SlackIntegration -
// that stays on the existing /api/slack/status endpoint).
export async function GET(request: Request) {
  if (!SLACK_MULTI_BOT_ENABLED) {
    return NextResponse.json({ error: "Not available." }, { status: 403 })
  }

  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const bots = await prisma.slackChannel.findMany({
    where: { clientId: userRecord.clientId as string },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      label: true,
      channelId: true,
      channelName: true,
      status: true,
      notifyOnFollowedEntityMessages: true,
      entityFilterConfigured: true,
      connectedAt: true,
      connectedByUser: { select: { firstName: true, lastName: true, email: true } },
    },
  })

  return NextResponse.json({
    bots,
    canManage: canManageSlackIntegration(userRecord.role),
    pricePerBot: ADDITIONAL_SLACK_BOT_PRICE,
  })
}

// Adds a new add-on bot channel. Requires the client's primary Slack workspace to already be
// connected (reuses that same bot token - one Slack app install per client, just posting to an
// additional channel). Immediately updates the Stripe subscription quantity via
// updateClientSlackBotSeats, so the $50/mo charge happens the moment this succeeds.
export async function POST(request: Request) {
  if (!SLACK_MULTI_BOT_ENABLED) {
    return NextResponse.json({ error: "Not available." }, { status: 403 })
  }

  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canManageSlackIntegration(userRecord.role)) {
    return NextResponse.json(
      { error: "Only account Owners or Admins can add a Slack bot." },
      { status: 403 },
    )
  }

  const clientId = userRecord.clientId as string
  const body = await request.json().catch(() => ({}))
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null

  const integration = await prisma.slackIntegration.findUnique({ where: { clientId } })
  if (!integration || integration.status !== "connected" || !integration.botAccessToken) {
    return NextResponse.json(
      { error: "Connect your primary Slack bot before adding another one." },
      { status: 400 },
    )
  }

  const bot = await prisma.slackChannel.create({
    data: {
      clientId,
      slackIntegrationId: integration.id,
      label,
      status: "awaiting_channel",
    },
  })

  try {
    await updateClientSlackBotSeats(clientId)
  } catch (error) {
    console.error("[v0] Error billing for new Slack bot, rolling back:", error)
    await prisma.slackChannel.delete({ where: { id: bot.id } })
    return NextResponse.json({ error: "Failed to update billing for the new bot." }, { status: 500 })
  }

  return NextResponse.json({ bot })
}
