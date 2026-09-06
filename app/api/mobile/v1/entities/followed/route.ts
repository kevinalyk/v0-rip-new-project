import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { requireClientContext, requireCompetitiveInsights } from "@/lib/services/authz"
import { listFollowedEntities } from "@/lib/services/entity-service"

// GET /api/mobile/v1/entities/followed — entities the caller's client currently follows.
export const GET = withMobileAuth(async (_request, ctx) => {
  requireCompetitiveInsights(ctx)
  const { clientId } = requireClientContext(ctx)
  const entities = await listFollowedEntities(clientId)
  return mobileJson({ data: entities })
})
