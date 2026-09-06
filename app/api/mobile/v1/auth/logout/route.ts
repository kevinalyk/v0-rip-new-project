import { mobileError, mobileJson, revokeMobileSession, withMobileAuth } from "@/lib/mobile-auth"

// POST /api/mobile/v1/auth/logout — requires a valid access token AND revokes the
// specific session identified by the given refresh token. Idempotent: revoking an
// already-revoked or unknown token still returns success so clients can always clear
// local state safely.
export const POST = withMobileAuth(async (request) => {
  let body: { refreshToken?: string }
  try {
    body = await request.json()
  } catch {
    return mobileError(400, "INVALID_BODY", "Request body must be valid JSON")
  }

  if (!body.refreshToken) {
    return mobileError(400, "INVALID_BODY", "refreshToken is required")
  }

  await revokeMobileSession(body.refreshToken)
  return mobileJson({ success: true })
})
