import { MobileAuthError, mobileError, mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import { requireCompetitiveInsights, requireFeedSearchAndFilters } from "@/lib/services/authz"
import { createMobileSavedView, listMobileSavedViews } from "@/lib/services/mobile-saved-view-service"

// GET /api/mobile/v1/feed/views — the caller's personal saved CI filter presets.
export const GET = withMobileAuth(async (_request, ctx) => {
  requireCompetitiveInsights(ctx)
  const { clientId } = requireFeedSearchAndFilters(ctx)
  return mobileJson({ data: await listMobileSavedViews(ctx.userId, clientId) })
})

// POST /api/mobile/v1/feed/views — save the caller's current mobile CI filters
// as a personal view that remains compatible with the web app.
export const POST = withMobileAuth(async (request, ctx) => {
  requireCompetitiveInsights(ctx)
  const { clientId } = requireFeedSearchAndFilters(ctx)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return mobileError(400, "INVALID_BODY", "Request body must be valid JSON")
  }

  try {
    const view = await createMobileSavedView(ctx.userId, clientId, body)
    return mobileJson({ data: view }, { status: 201 })
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileError(error.status, error.code, error.message)
    throw error
  }
})
