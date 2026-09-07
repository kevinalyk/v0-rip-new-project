import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { requireClientContext, requireCompetitiveInsights } from "@/lib/services/authz"
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
  const { clientId } = requireClientContext(ctx)
  const entities = await listMobileFeedEntities(clientId)
  return mobileJson({
    states: STATES,
    parties: PARTIES,
    // Office remains available for campaign-alert creation, but the iPhone feed
    // deliberately does not expose or send an Office filter.
    offices: OFFICES,
    entityTypes: MOBILE_ENTITY_TYPES,
    messageFilters: MOBILE_MESSAGE_FILTERS,
    donationPlatforms: MOBILE_DONATION_PLATFORMS,
    entities,
  })
})
