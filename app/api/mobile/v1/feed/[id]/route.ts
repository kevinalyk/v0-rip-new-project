import { withMobileAuth, mobileError, mobileJson } from "@/lib/mobile-auth"
import { requireClientContext, requireCompetitiveInsights } from "@/lib/services/authz"
import { getFeedItemById } from "@/lib/services/feed-service"

// GET /api/mobile/v1/feed/:id?type=email|sms — single campaign/message detail.
export const GET = withMobileAuth<{ params: Promise<{ id: string }> }>(async (request, ctx, { params }) => {
  requireCompetitiveInsights(ctx)
  const { clientId, plan } = requireClientContext(ctx)

  const { id } = await params
  const url = new URL(request.url)
  const type = url.searchParams.get("type") === "sms" ? "sms" : "email"

  const item = await getFeedItemById(clientId, plan, id, type)
  if (!item) {
    return mobileError(404, "NOT_FOUND", "Message not found")
  }

  return mobileJson({ data: item })
})
