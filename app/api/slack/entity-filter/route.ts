import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"

// Reads the client's current Slack entity filter selection. If the client has
// never configured a filter (entityFilterConfigured = false), we return the
// entities they currently follow on the CI Feed as the suggested starting
// point - the UI defaults its checkboxes from this, but nothing is persisted
// until the client explicitly saves.
export async function GET(request: Request) {
  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clientId = userRecord.clientId as string

  const integration = await prisma.slackIntegration.findUnique({
    where: { clientId },
    select: { entityFilterConfigured: true },
  })

  if (!integration) {
    return NextResponse.json({ error: "Slack is not connected yet." }, { status: 400 })
  }

  if (integration.entityFilterConfigured) {
    const filters = await prisma.slackEntityFilter.findMany({
      where: { clientId },
      select: { entityId: true },
    })
    return NextResponse.json({
      entityFilterConfigured: true,
      entityIds: filters.map((f: { entityId: string }) => f.entityId),
    })
  }

  // Not configured yet - suggest current Following as the default selection.
  const subscriptions = await prisma.ciEntitySubscription.findMany({
    where: { clientId },
    select: { entityId: true },
  })

  return NextResponse.json({
    entityFilterConfigured: false,
    entityIds: subscriptions.map((s: { entityId: string }) => s.entityId),
  })
}

// Saves the client's Slack entity filter selection. An empty array is a
// valid, deliberate choice (alert on nothing) - callers should confirm with
// the user in the UI before submitting one.
export async function PUT(request: Request) {
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

  const body = await request.json().catch(() => ({}))
  const { entityIds } = body

  if (!Array.isArray(entityIds) || !entityIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "entityIds must be an array of strings" }, { status: 400 })
  }

  const clientId = userRecord.clientId as string

  const integration = await prisma.slackIntegration.findUnique({ where: { clientId } })
  if (!integration) {
    return NextResponse.json({ error: "Slack is not connected yet." }, { status: 400 })
  }

  const uniqueEntityIds = Array.from(new Set(entityIds))

  await prisma.$transaction([
    prisma.slackEntityFilter.deleteMany({ where: { clientId } }),
    ...(uniqueEntityIds.length > 0
      ? [
          prisma.slackEntityFilter.createMany({
            data: uniqueEntityIds.map((entityId) => ({ clientId, entityId })),
          }),
        ]
      : []),
    prisma.slackIntegration.update({
      where: { clientId },
      data: { entityFilterConfigured: true },
    }),
  ])

  return NextResponse.json({ entityFilterConfigured: true, entityIds: uniqueEntityIds })
}
