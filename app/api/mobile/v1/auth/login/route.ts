import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"
import {
  checkMobileRateLimit,
  issueMobileSession,
  mobileError,
  mobileJson,
  rateLimitKeyForEmail,
  rateLimitKeyForIp,
} from "@/lib/mobile-auth"

const LOGIN_RATE_LIMIT_PER_MINUTE = 5

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

// POST /api/mobile/v1/auth/login — issues a mobile session (no cookies). Public
// (allow-listed in middleware.ts), rate-limited by hashed IP + email.
export async function POST(request: Request) {
  let body: { email?: string; password?: string; deviceId?: string; deviceName?: string }
  try {
    body = await request.json()
  } catch {
    return mobileError(400, "INVALID_BODY", "Request body must be valid JSON")
  }

  const { email, password, deviceId, deviceName } = body
  if (!email || !password) {
    return mobileError(400, "INVALID_BODY", "email and password are required")
  }

  const ip = getClientIp(request)
  const ipAllowed = await checkMobileRateLimit(rateLimitKeyForIp(ip), LOGIN_RATE_LIMIT_PER_MINUTE)
  const emailAllowed = await checkMobileRateLimit(rateLimitKeyForEmail(email), LOGIN_RATE_LIMIT_PER_MINUTE)
  if (!ipAllowed || !emailAllowed) {
    // Same generic shape as an invalid-credentials error — no signal about which
    // limit tripped or whether the account exists.
    return mobileError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Please try again later.")
  }

  const normalizedEmail = email.toLowerCase()
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { client: { select: { id: true, slug: true } } },
  })

  const genericInvalid = () => mobileError(401, "INVALID_CREDENTIALS", "Invalid email or password")

  if (!user) {
    return genericInvalid()
  }

  const passwordMatch = await bcryptjs.compare(password, user.password)
  if (!passwordMatch) {
    return genericInvalid()
  }

  // Mirrors the web app's forced first-login/password-reset flow (app/api/auth/login):
  // never issue a normal mobile session to an account that must reset its password first.
  if (user.firstLogin) {
    return mobileError(
      403,
      "PASSWORD_RESET_REQUIRED",
      "This account must complete a password reset before signing in on mobile. Please reset your password from the web app first.",
    )
  }

  const session = await issueMobileSession(user.id, deviceId, deviceName)

  prisma.user.update({ where: { id: user.id }, data: { lastActive: new Date() } }).catch((err) => {
    console.error("[mobile-auth] Failed to update lastActive:", err)
  })

  return mobileJson({
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
    tokenType: "Bearer",
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  })
}
