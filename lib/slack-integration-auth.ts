import { SignJWT, jwtVerify } from "jose"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

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
