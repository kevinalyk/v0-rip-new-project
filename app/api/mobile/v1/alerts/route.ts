import { withMobileAuth, mobileError, mobileJson } from "@/lib/mobile-auth"
import { MobileAuthError } from "@/lib/mobile-auth"
import { createAlert, listAlerts } from "@/lib/services/alert-service"

// GET /api/mobile/v1/alerts — list campaign alerts for the current user.
export const GET = withMobileAuth(async (_request, ctx) => {
  const alerts = await listAlerts(ctx.userId)
  return mobileJson({ data: alerts })
})

// POST /api/mobile/v1/alerts — create a campaign alert.
export const POST = withMobileAuth(async (request, ctx) => {
  let body: { name?: string; party?: string; state?: string; office?: string }
  try {
    body = await request.json()
  } catch {
    return mobileError(400, "INVALID_BODY", "Request body must be valid JSON")
  }

  try {
    const alert = await createAlert(ctx.userId, body)
    return mobileJson({ data: alert }, { status: 201 })
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileError(error.status, error.code, error.message)
    throw error
  }
})
