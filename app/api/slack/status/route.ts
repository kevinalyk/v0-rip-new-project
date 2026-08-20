import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { canManageSlackIntegration, getRequestingClientUser } from "@/lib/slack-integration-auth"

// Any member of the client can view the Slack connection status; only
// Owners/Admins can change it (enforced in the mutating routes).
export async function GET(request: Request) {
  const userRecord = await getRequestingClientUser(request)
  if (!userRecord) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const integration = await prisma.slackIntegration.findUnique({
    where: { clientId: userRecord.clientId as string },
    select: {
      status: true,
      teamName: true,
      channelId: true,
      channelName: true,
      connectedAt: true,
      notifyOnFollowedEntityMessages: true,
      connectedByUser: { select: { firstName: true, lastName: true, email: true } },
    },
  })

  return NextResponse.json({
    integration,
    canManage: canManageSlackIntegration(userRecord.role),
  })
}
