import { withMobileAuth, mobileError, mobileJson } from "@/lib/mobile-auth"
import { requireClientContext, requireCompetitiveInsights } from "@/lib/services/authz"
import { createFeedShareLink } from "@/lib/services/feed-service"

// POST /api/mobile/v1/feed/:id/share?type=email|sms — create/reuse a public
// share URL after enforcing the same access and retention rules as feed detail.
export const POST = withMobileAuth<{ params: Promise<{ id: string }> }>(async (request, ctx, { params }) => {
  requireCompetitiveInsights(ctx)
  const { clientId, plan } = requireClientContext(ctx)

  const { id } = await params
  const url = new URL(request.url)
  const type = url.searchParams.get("type") === "sms" ? "sms" : "email"
  const result = await createFeedShareLink(clientId, plan, id, type, url.origin)

  if (!result) {
    return mobileError(404, "NOT_FOUND", "Message not found")
  }

  return mobileJson(result)
})
