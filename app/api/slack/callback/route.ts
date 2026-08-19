import { NextResponse } from "next/server"
import { getTokenResponse } from "@vercel/connect"
import prisma from "@/lib/prisma"
import { getOrigin } from "@/lib/get-origin"
import { verifySlackConnectState } from "@/lib/slack-integration-auth"
import { SLACK_CONNECTOR_UID } from "@/app/api/slack/connect/route"

// Slack redirects the browser here (via Vercel Connect) once the workspace
// admin approves the install. We resolve which client initiated this via the
// signed state token, then fetch the resulting installation's team info and
// mark the integration as awaiting a channel selection.
export async function GET(request: Request) {
  const origin = await getOrigin()
  const url = new URL(request.url)
  const stateToken = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")

  // Client-scoped pages live under /[clientSlug]/..., so every redirect back
  // to the UI needs that client's slug, not a flat path.
  const redirectTo = async (clientId: string | null, query: string) => {
    const slug = clientId
      ? (await prisma.client.findUnique({ where: { id: clientId }, select: { slug: true } }))?.slug
      : null
    const base = slug ? `/${slug}/account/integrations` : `/account/integrations`
    return NextResponse.redirect(`${origin}${base}?${query}`)
  }

  if (errorParam) {
    console.error("[v0] Slack authorization returned an error:", errorParam)
    return redirectTo(null, `slack_error=authorization_failed`)
  }

  if (!stateToken) {
    return redirectTo(null, `slack_error=missing_state`)
  }

  const state = await verifySlackConnectState(stateToken)
  if (!state) {
    return redirectTo(null, `slack_error=invalid_state`)
  }

  try {
    const tokenResponse = await getTokenResponse(SLACK_CONNECTOR_UID, {
      subject: { type: "user", id: state.clientId },
      scopes: ["*"],
    })

    const teamId =
      (tokenResponse.metadata?.team_id as string | undefined) ??
      (tokenResponse.metadata?.teamId as string | undefined) ??
      tokenResponse.tenantId ??
      null
    const teamName =
      (tokenResponse.metadata?.team_name as string | undefined) ??
      (tokenResponse.metadata?.teamName as string | undefined) ??
      null

    if (!teamId) {
      console.error("[v0] Slack token response missing team identifier:", tokenResponse)
      return redirectTo(state.clientId, `slack_error=missing_team`)
    }

    await prisma.slackIntegration.update({
      where: { clientId: state.clientId },
      data: {
        installationId: tokenResponse.installationId ?? null,
        teamId,
        teamName,
        status: "awaiting_channel",
      },
    })

    return redirectTo(state.clientId, `slack_connected=1`)
  } catch (error) {
    console.error("[v0] Error completing Slack authorization:", error)
    return redirectTo(state.clientId, `slack_error=token_exchange_failed`)
  }
}
