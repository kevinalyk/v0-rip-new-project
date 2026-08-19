import { NextResponse } from "next/server"
import { getToken } from "@vercel/connect"
import prisma from "@/lib/prisma"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"
import { SLACK_CONNECTOR_UID } from "@/app/api/slack/connect/route"

// Lists public channels in the connected workspace so an Owner/Admin can
// pick where alerts get posted. Requires the workspace authorization step
// (POST /api/slack/connect) to already be complete.
export async function GET(request: Request) {
  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canManageSlackIntegration(userRecord.role)) {
    return NextResponse.json(
      { error: "Only account Owners or Admins can configure the Slack channel." },
      { status: 403 },
    )
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: { clientId: userRecord.clientId as string },
  })

  if (!integration || !integration.teamId) {
    return NextResponse.json({ error: "Slack is not connected yet." }, { status: 400 })
  }

  try {
    const botToken = await getToken(SLACK_CONNECTOR_UID, {
      subject: { type: "app" },
      installationId: integration.installationId ?? undefined,
      scopes: ["*"],
    })

    const response = await fetch(
      "https://slack.com/api/conversations.list?types=public_channel&exclude_archived=true&limit=200",
      { headers: { Authorization: `Bearer ${botToken}` } },
    )
    const data = await response.json()

    if (!data.ok) {
      console.error("[v0] Slack conversations.list error:", data.error)
      return NextResponse.json({ error: "Failed to load Slack channels." }, { status: 502 })
    }

    const channels = (data.channels ?? []).map((channel: any) => ({
      id: channel.id,
      name: channel.name as string,
    }))

    return NextResponse.json({ channels })
  } catch (error) {
    console.error("[v0] Error fetching Slack channels:", error)
    return NextResponse.json({ error: "Failed to load Slack channels." }, { status: 500 })
  }
}
