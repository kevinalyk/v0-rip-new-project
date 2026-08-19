import { NextResponse } from "next/server"
import { getToken } from "@vercel/connect"
import prisma from "@/lib/prisma"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"
import { SLACK_CONNECTOR_UID } from "@/app/api/slack/connect/route"

// Finalizes setup: joins the chosen channel, posts a confirmation message,
// and marks the integration "connected" for the whole client.
export async function POST(request: Request) {
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

  const { channelId, channelName } = await request.json()
  if (!channelId || !channelName) {
    return NextResponse.json({ error: "channelId and channelName are required" }, { status: 400 })
  }

  const clientId = userRecord.clientId as string
  const integration = await prisma.slackIntegration.findUnique({ where: { clientId } })

  if (!integration || !integration.teamId) {
    return NextResponse.json({ error: "Slack is not connected yet." }, { status: 400 })
  }

  try {
    const botToken = await getToken(SLACK_CONNECTOR_UID, {
      subject: { type: "user", id: clientId },
      installationId: integration.installationId ?? undefined,
      scopes: ["*"],
    })

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

    const updated = await prisma.slackIntegration.update({
      where: { clientId },
      data: {
        channelId,
        channelName,
        status: "connected",
        connectedByUserId: userRecord.id,
        connectedAt: new Date(),
      },
    })

    return NextResponse.json({ integration: updated })
  } catch (error) {
    console.error("[v0] Error finalizing Slack channel selection:", error)
    return NextResponse.json({ error: "Failed to connect the Slack channel." }, { status: 500 })
  }
}
