import { SignJWT, jwtVerify } from "jose"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

// We install our own Slack app (registered at api.slack.com) directly via
// Slack's OAuth v2 flow, rather than through Vercel Connect - Connect's
// per-workspace app-install API is feature-gated and unavailable to us.
// One Slack app + these credentials serves every client's workspace install;
// client isolation happens in our own data layer via SlackIntegration.teamId.
export const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID || ""
export const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET || ""

// Bot scopes this app actually calls: conversations.list (channels:read),
// conversations.join (channels:join), and chat.postMessage (chat:write).
// These must be added as Bot Token Scopes on the Slack app itself (OAuth &
// Permissions page) or Slack will reject the authorize request outright.
export const SLACK_SCOPES = ["channels:read", "channels:join", "chat:write"]

// Roles allowed to connect, reconfigure, or disconnect the company-wide Slack
// integration. Every other role (editor, viewer) can view connection status
// but not change it - Slack is a company-wide setting, not a per-user one.
const SLACK_MANAGER_ROLES = ["owner", "admin", "super_admin"]

export function canManageSlackIntegration(role: string | null | undefined) {
  return !!role && SLACK_MANAGER_ROLES.includes(role)
}

/**
 * Resolves the authenticated request to { userId, role, clientId }, or null
 * if unauthenticated or the user has no client (e.g. a RIP employee with no
 * client assignment - Slack integration is a per-client concept).
 */
export async function getRequestingClientUser(request: Request) {
  const authUser = await getAuthenticatedUser(request)
  if (!authUser) return null

  const userId = authUser.userId || authUser.id
  if (!userId) return null

  const userRecord = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, clientId: true },
  })

  if (!userRecord?.clientId) return null

  return userRecord
}

const STATE_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production",
)

/**
 * Signs a short-lived token carrying the clientId + initiating userId through
 * the Slack OAuth redirect round-trip, so the callback route can correlate
 * the completed authorization back to the right client without trusting raw
 * query params.
 */
export async function signSlackConnectState(params: { clientId: string; userId: string }) {
  return await new SignJWT(params)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(STATE_SECRET)
}

export async function verifySlackConnectState(token: string) {
  try {
    const { payload } = await jwtVerify(token, STATE_SECRET, { algorithms: ["HS256"] })
    if (typeof payload.clientId !== "string" || typeof payload.userId !== "string") return null
    return { clientId: payload.clientId, userId: payload.userId }
  } catch {
    return null
  }
}

/** Builds the Slack "Add to Slack" authorize URL for our own Slack app. */
export function buildSlackAuthorizeUrl(params: { redirectUri: string; state: string }) {
  const query = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: SLACK_SCOPES.join(","),
    redirect_uri: params.redirectUri,
    state: params.state,
  })
  return `https://slack.com/oauth/v2/authorize?${query.toString()}`
}

interface SlackOAuthExchangeResult {
  accessToken: string
  teamId: string
  teamName: string | null
  botUserId: string | null
}

/**
 * Exchanges the authorization `code` Slack redirected back with for a bot
 * access token, calling Slack's oauth.v2.access endpoint directly (no
 * Vercel Connect involved).
 */
export async function exchangeSlackOAuthCode(params: {
  code: string
  redirectUri: string
}): Promise<SlackOAuthExchangeResult> {
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  })

  const data = await response.json()

  if (!data.ok) {
    throw new Error(`Slack oauth.v2.access error: ${data.error ?? "unknown_error"}`)
  }

  const accessToken = data.access_token as string | undefined
  const teamId = data.team?.id as string | undefined

  if (!accessToken || !teamId) {
    throw new Error("Slack oauth.v2.access response missing access_token or team.id")
  }

  return {
    accessToken,
    teamId,
    teamName: (data.team?.name as string | undefined) ?? null,
    botUserId: (data.bot_user_id as string | undefined) ?? null,
  }
}
