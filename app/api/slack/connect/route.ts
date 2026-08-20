import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getOrigin } from "@/lib/get-origin"
import {
  buildSlackAuthorizeUrl,
  canManageSlackIntegration,
  getRequestingClientUser,
  signSlackConnectState,
  SLACK_CLIENT_ID,
} from "@/lib/slack-integration-auth"

// Starts the company-wide Slack connection flow. Only Owners/Admins may
// initiate this - Slack is a single, shared integration for the whole
// client, not a per-user connection.
export async function POST(request: Request) {
  try {
    if (!SLACK_CLIENT_ID) {
      console.error("[v0] SLACK_CLIENT_ID is not configured")
      return NextResponse.json({ error: "Slack is not configured on this server." }, { status: 500 })
    }

    const userRecord = await getRequestingClientUser(request)
    if (!userRecord) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (!canManageSlackIntegration(userRecord.role)) {
      return NextResponse.json(
        { error: "Only account Owners or Admins can connect Slack for your organization." },
        { status: 403 },
      )
    }

    const clientId = userRecord.clientId as string

    const origin = await getOrigin()
    const state = await signSlackConnectState({ clientId, userId: userRecord.id })

    const url = buildSlackAuthorizeUrl({
      redirectUri: `${origin}/api/slack/callback`,
      state,
    })

    await prisma.slackIntegration.upsert({
      where: { clientId },
      create: { clientId, status: "pending" },
      update: { status: "pending", teamId: null, teamName: null },
    })

    return NextResponse.json({ url })
  } catch (error) {
    console.error("[v0] Error starting Slack authorization:", error)
    return NextResponse.json({ error: "Failed to start Slack connection" }, { status: 500 })
  }
}
