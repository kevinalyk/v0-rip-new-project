import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { requireCompetitiveInsights, requireFeedSearchAndFilters } from "@/lib/services/authz"
import { OFFICES, PARTIES, STATES } from "@/lib/campaign-filter-options"
import {
  MOBILE_DONATION_PLATFORMS,
  MOBILE_ENTITY_TYPES,
  MOBILE_MESSAGE_FILTERS,
  listMobileFeedEntities,
} from "@/lib/services/feed-service"

// GET /api/mobile/v1/feed/filters — filter metadata plus the searchable entity picker.
export const GET = withMobileAuth(async (_request, ctx) => {
  requireCompetitiveInsights(ctx)
  const { clientId } = requireFeedSearchAndFilters(ctx)
  const entities = await listMobileFeedEntities(clientId)
  return mobileJson({
    states: STATES,
    parties: PARTIES,
    // Retained for backwards compatibility with pre-entitlement mobile clients.
    // New clients use alerts/options and never expose Office as a feed filter.
    offices: OFFICES,
    entityTypes: MOBILE_ENTITY_TYPES,
    messageFilters: MOBILE_MESSAGE_FILTERS,
    donationPlatforms: MOBILE_DONATION_PLATFORMS,
    entities,
  })
})
