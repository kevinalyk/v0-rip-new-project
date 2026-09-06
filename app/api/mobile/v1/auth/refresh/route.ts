import {
  MobileAuthError,
  checkMobileRateLimit,
  mobileError,
  mobileJson,
  rateLimitKeyForIp,
  rotateMobileSession,
} from "@/lib/mobile-auth"

const REFRESH_RATE_LIMIT_PER_MINUTE = 10

function getClientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  )
}

// POST /api/mobile/v1/auth/refresh — rotates a refresh token. Public (allow-listed in
// middleware.ts) since the caller has no access token left to send, but rate-limited by IP.
export async function POST(request: Request) {
  let body: { refreshToken?: string }
  try {
    body = await request.json()
  } catch {
    return mobileError(400, "INVALID_BODY", "Request body must be valid JSON")
  }

  const { refreshToken } = body
  if (!refreshToken) {
    return mobileError(400, "INVALID_BODY", "refreshToken is required")
  }

  const ip = getClientIp(request)
  const allowed = await checkMobileRateLimit(rateLimitKeyForIp(ip), REFRESH_RATE_LIMIT_PER_MINUTE)
  if (!allowed) {
    return mobileError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Please try again later.")
  }

  try {
    const session = await rotateMobileSession(refreshToken)
    return mobileJson({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      tokenType: "Bearer",
    })
  } catch (error) {
    if (error instanceof MobileAuthError) {
      return mobileError(error.status, error.code, error.message)
    }
    console.error("[mobile-auth] refresh error:", error)
    return mobileError(500, "INTERNAL_ERROR", "Internal server error")
  }
}
