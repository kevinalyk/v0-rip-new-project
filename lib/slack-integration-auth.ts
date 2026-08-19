import { SignJWT, jwtVerify } from "jose"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

// The single shared Vercel Connect Slack connector. Every client installs
// this same app into their own workspace; Connect keeps each workspace's
// bot token isolated under its own installationId within this one connector.
export const SLACK_CONNECTOR_UID = "slack/rip-tool-slack-alerts"

// Bot scopes this app actually calls: conversations.list (channels:read),
// conversations.join (channels:join), and chat.postMessage (chat:write).
// Vercel Connect passes these through to Slack's OAuth consent screen, so
// they must be the real Slack scope names, not a wildcard - Slack has no "*".
// Keep this identical across startAuthorization and every getToken call.
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
