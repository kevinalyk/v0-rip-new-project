import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"

export async function POST(request: Request) {
  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canManageSlackIntegration(userRecord.role)) {
    return NextResponse.json(
      { error: "Only account Owners or Admins can disconnect Slack for your organization." },
      { status: 403 },
    )
  }

  const clientId = userRecord.clientId as string
  const integration = await prisma.slackIntegration.findUnique({ where: { clientId } })

  if (!integration) {
    return NextResponse.json({ error: "Slack is not connected." }, { status: 400 })
  }

  if (integration.botAccessToken) {
    try {
      const botToken = decrypt(integration.botAccessToken)
      await fetch("https://slack.com/api/auth.revoke", {
        method: "POST",
        headers: { Authorization: `Bearer ${botToken}` },
      })
    } catch (error) {
      // Continue even if the remote revoke fails - we still want to reflect
      // "disconnected" locally so the client can retry connecting cleanly.
      console.error("[v0] Error revoking Slack token:", error)
    }
  }

  const updated = await prisma.slackIntegration.update({
    where: { clientId },
    data: {
      status: "disconnected",
      disconnectedAt: new Date(),
      botAccessToken: null,
      botUserId: null,
      teamId: null,
      teamName: null,
      channelId: null,
      channelName: null,
    },
  })

  return NextResponse.json({ integration: updated })
}
