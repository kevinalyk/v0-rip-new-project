import { mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import { requireCompetitiveInsights, requireFeedSearchAndFilters } from "@/lib/services/authz"
import { listMobileSavedViews } from "@/lib/services/mobile-saved-view-service"

// GET /api/mobile/v1/feed/views — organization-wide saved CI filter presets.
export const GET = withMobileAuth(async (_request, ctx) => {
  requireCompetitiveInsights(ctx)
  const { clientId } = requireFeedSearchAndFilters(ctx)
  return mobileJson({ data: await listMobileSavedViews(clientId) })
})
