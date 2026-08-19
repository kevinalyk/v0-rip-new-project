import { NextResponse } from "next/server"
import { startAuthorization } from "@vercel/connect"
import prisma from "@/lib/prisma"
import { getOrigin } from "@/lib/get-origin"
import {
  canManageSlackIntegration,
  getRequestingClientUser,
  signSlackConnectState,
} from "@/lib/slack-integration-auth"

// The single shared Vercel Connect Slack connector. Every client installs
// this same app into their own workspace; Connect keeps each workspace's
// bot token isolated under its own installationId within this one connector.
export const SLACK_CONNECTOR_UID = "slack/rip-tool-slack-alerts"

// Starts the company-wide Slack connection flow. Only Owners/Admins may
// initiate this - Slack is a single, shared integration for the whole
// client, not a per-user connection.
export async function POST(request: Request) {
  try {
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

    const { url } = await startAuthorization(
      SLACK_CONNECTOR_UID,
      { subject: { type: "app" }, scopes: ["*"] },
      { callbackUrl: `${origin}/api/slack/callback?state=${encodeURIComponent(state)}` },
    )

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
