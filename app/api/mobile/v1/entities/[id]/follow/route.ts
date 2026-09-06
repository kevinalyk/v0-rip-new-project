import { withMobileAuth, mobileError, mobileJson } from "@/lib/mobile-auth"
import { requireClientContext, requireCompetitiveInsights } from "@/lib/services/authz"
import { followEntity, unfollowEntity } from "@/lib/services/entity-service"
import { MobileAuthError } from "@/lib/mobile-auth"
import type { SubscriptionPlan } from "@/lib/subscription-utils"

type Params = { params: Promise<{ id: string }> }

// POST /api/mobile/v1/entities/:id/follow — follow an entity, enforcing plan follow limits.
export const POST = withMobileAuth<Params>(async (_request, ctx, { params }) => {
  requireCompetitiveInsights(ctx)
  const { clientId, plan } = requireClientContext(ctx)
  const { id } = await params

  try {
    const result = await followEntity(clientId, plan as SubscriptionPlan, id)
    return mobileJson({ following: true, alreadyFollowing: result.alreadyFollowing })
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileError(error.status, error.code, error.message)
    throw error
  }
})

// DELETE /api/mobile/v1/entities/:id/follow — unfollow an entity.
export const DELETE = withMobileAuth<Params>(async (_request, ctx, { params }) => {
  requireCompetitiveInsights(ctx)
  const { clientId } = requireClientContext(ctx)
  const { id } = await params

  await unfollowEntity(clientId, id)
  return mobileJson({ following: false })
})
