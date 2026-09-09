import { STATES } from "@/lib/campaign-filter-options"
import { mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import { requireClientContext } from "@/lib/services/authz"
import {
  MOBILE_DIRECTORY_ENTITY_TYPES,
  MOBILE_DIRECTORY_PARTIES,
} from "@/lib/services/directory-service"

// GET /api/mobile/v1/entities/options — filter facets for the mobile Directory.
export const GET = withMobileAuth(async (_request, ctx) => {
  requireClientContext(ctx)
  return mobileJson({
    states: STATES,
    parties: MOBILE_DIRECTORY_PARTIES,
    entityTypes: MOBILE_DIRECTORY_ENTITY_TYPES,
  })
})
