import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getOrigin } from "@/lib/get-origin"
import { encrypt } from "@/lib/encryption"
import { exchangeSlackOAuthCode, verifySlackConnectState } from "@/lib/slack-integration-auth"

// Slack redirects the browser here directly (no Vercel Connect involved)
// once the workspace admin approves the install. We resolve which client
// initiated this via the signed state token, exchange the `code` for a bot
// token ourselves, then mark the integration as awaiting a channel selection.
export async function GET(request: Request) {
  const origin = await getOrigin()
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
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

  if (!code) {
    return redirectTo(state.clientId, `slack_error=missing_code`)
  }

  try {
    const { accessToken, teamId, teamName, botUserId } = await exchangeSlackOAuthCode({
      code,
      redirectUri: `${origin}/api/slack/callback`,
    })

    await prisma.slackIntegration.update({
      where: { clientId: state.clientId },
      data: {
        botAccessToken: encrypt(accessToken),
        botUserId,
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
