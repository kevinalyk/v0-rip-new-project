import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"

// Updates which alert types post to the connected Slack channel. Same
// company-wide scope and role gating as connect/disconnect: only
// Owners/Admins/super_admins may change these, everyone else can just view
// them on the integrations page.
export async function PATCH(request: Request) {
  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  if (!canManageSlackIntegration(userRecord.role)) {
    return NextResponse.json(
      { error: "Only account Owners or Admins can change Slack notification preferences." },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => ({}))
  const { notifyOnFollowedEntityMessages } = body

  if (typeof notifyOnFollowedEntityMessages !== "boolean") {
    return NextResponse.json({ error: "notifyOnFollowedEntityMessages must be a boolean" }, { status: 400 })
  }

  const clientId = userRecord.clientId as string
  const integration = await prisma.slackIntegration.findUnique({ where: { clientId } })

  if (!integration || integration.status !== "connected") {
    return NextResponse.json({ error: "Slack is not connected yet." }, { status: 400 })
  }

  const updated = await prisma.slackIntegration.update({
    where: { clientId },
    data: { notifyOnFollowedEntityMessages },
  })

  return NextResponse.json({
    notifyOnFollowedEntityMessages: updated.notifyOnFollowedEntityMessages,
  })
}
