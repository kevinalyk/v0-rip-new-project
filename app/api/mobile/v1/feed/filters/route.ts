import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { requireCompetitiveInsights } from "@/lib/services/authz"
import { OFFICES, PARTIES, STATES } from "@/lib/campaign-filter-options"

// GET /api/mobile/v1/feed/filters — static filter metadata for building the mobile filter UI.
export const GET = withMobileAuth(async (_request, ctx) => {
  requireCompetitiveInsights(ctx)
  return mobileJson({ states: STATES, parties: PARTIES, offices: OFFICES })
})
