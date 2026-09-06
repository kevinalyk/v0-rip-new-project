import { withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { requireClientContext, requireCompetitiveInsights } from "@/lib/services/authz"
import { decodeCursor, getFeedPage } from "@/lib/services/feed-service"

// GET /api/mobile/v1/feed — cursor-paginated campaign/message feed.
// Query params: search, party, state, office, entityType, messageType, tag, subscriptionsOnly, cursor
export const GET = withMobileAuth(async (request, ctx) => {
  requireCompetitiveInsights(ctx)
  const { clientId, plan } = requireClientContext(ctx)

  const url = new URL(request.url)
  const cursor = decodeCursor(url.searchParams.get("cursor"))

  const { items, nextCursor, hasMore } = await getFeedPage(
    clientId,
    plan,
    {
      search: url.searchParams.get("search") || undefined,
      party: url.searchParams.get("party") || undefined,
      state: url.searchParams.get("state") || undefined,
      office: url.searchParams.get("office") || undefined,
      entityType: url.searchParams.get("entityType") || undefined,
      messageType: (url.searchParams.get("messageType") as "email" | "sms") || undefined,
      tag: url.searchParams.get("tag") || undefined,
      subscriptionsOnly: url.searchParams.get("subscriptionsOnly") === "true",
    },
    cursor,
  )

  return mobileJson({ data: items, pagination: { nextCursor, hasMore } })
})
