import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"
import {
  isValidMessageTypeFilter,
  isValidHouseFileFilter,
  isValidPartyFilter,
  isValidStateFilter,
  isValidEntityTypeFilter,
} from "@/lib/slack-message-filters"

// Reads the client's current message-level Slack alert filters (channel, house file/third
// party, party, state, entity type) on the primary SlackIntegration. Independent of the
// entity allow-list (see /api/slack/entity-filter) - all default to "all" (no restriction).
export async function GET(request: Request) {
  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const clientId = userRecord.clientId as string

  const integration = await prisma.slackIntegration.findUnique({
    where: { clientId },
    select: {
      messageTypeFilter: true,
      houseFileFilter: true,
      partyFilter: true,
      stateFilter: true,
      entityTypeFilter: true,
    },
  })

  if (!integration) {
    return NextResponse.json({ error: "Slack is not connected yet." }, { status: 400 })
  }

  return NextResponse.json(integration)
}

// Saves the client's message-level Slack alert filters. Only the fields present in the body
// are updated, so callers can PATCH a single dimension without resending the rest.
export async function PATCH(request: Request) {
  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canManageSlackIntegration(userRecord.role)) {
    return NextResponse.json(
      { error: "Only account Owners or Admins can change which messages are sent to Slack." },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => ({}))
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

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid filter fields provided" }, { status: 400 })
  }

  const clientId = userRecord.clientId as string
  const integration = await prisma.slackIntegration.findUnique({ where: { clientId } })
  if (!integration) {
    return NextResponse.json({ error: "Slack is not connected yet." }, { status: 400 })
  }

  const updated = await prisma.slackIntegration.update({
    where: { clientId },
    data,
    select: {
      messageTypeFilter: true,
      houseFileFilter: true,
      partyFilter: true,
      stateFilter: true,
      entityTypeFilter: true,
    },
  })

  return NextResponse.json(updated)
}
