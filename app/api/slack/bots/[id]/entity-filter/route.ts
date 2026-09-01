import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"
import { SLACK_MULTI_BOT_ENABLED } from "@/lib/feature-flags"

// Per-bot equivalent of /api/slack/entity-filter - fully wired but hidden behind
// SLACK_MULTI_BOT_ENABLED until launch. See app/api/slack/bots/route.ts.

// Reads this bot's current entity filter selection. If never configured, suggests the
// client's current CI Feed "Following" list as a starting point, same as the primary filter.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!SLACK_MULTI_BOT_ENABLED) {
    return NextResponse.json({ error: "Not available." }, { status: 403 })
  }

  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const clientId = userRecord.clientId as string

  const bot = await prisma.slackChannel.findFirst({
    where: { id, clientId },
    select: { entityFilterConfigured: true },
  })

  if (!bot) {
    return NextResponse.json({ error: "Bot not found." }, { status: 404 })
  }

  if (bot.entityFilterConfigured) {
    const filters = await prisma.slackChannelEntityFilter.findMany({
      where: { slackChannelId: id },
      select: { entityId: true },
    })
    return NextResponse.json({
      entityFilterConfigured: true,
      entityIds: filters.map((f: { entityId: string }) => f.entityId),
    })
  }

  const subscriptions = await prisma.ciEntitySubscription.findMany({
    where: { clientId },
    select: { entityId: true },
  })

  return NextResponse.json({
    entityFilterConfigured: false,
    entityIds: subscriptions.map((s: { entityId: string }) => s.entityId),
  })
}

// Saves this bot's entity filter selection. An empty array is a valid, deliberate choice
// (alert on nothing).
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!SLACK_MULTI_BOT_ENABLED) {
    return NextResponse.json({ error: "Not available." }, { status: 403 })
  }

  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canManageSlackIntegration(userRecord.role)) {
    return NextResponse.json(
      { error: "Only account Owners or Admins can change which entities are sent to Slack." },
      { status: 403 },
    )
  }

  const { id } = await params
  const clientId = userRecord.clientId as string

  const body = await request.json().catch(() => ({}))
  const { entityIds } = body

  if (!Array.isArray(entityIds) || !entityIds.every((eid) => typeof eid === "string")) {
    return NextResponse.json({ error: "entityIds must be an array of strings" }, { status: 400 })
  }

  const bot = await prisma.slackChannel.findFirst({ where: { id, clientId } })
  if (!bot) {
    return NextResponse.json({ error: "Bot not found." }, { status: 404 })
  }

  const uniqueEntityIds = Array.from(new Set(entityIds))

  await prisma.$transaction([
    prisma.slackChannelEntityFilter.deleteMany({ where: { slackChannelId: id } }),
    ...(uniqueEntityIds.length > 0
      ? [
          prisma.slackChannelEntityFilter.createMany({
            data: uniqueEntityIds.map((entityId) => ({ slackChannelId: id, entityId })),
          }),
        ]
      : []),
    prisma.slackChannel.update({
      where: { id },
      data: { entityFilterConfigured: true },
    }),
  ])

  return NextResponse.json({ entityFilterConfigured: true, entityIds: uniqueEntityIds })
}
