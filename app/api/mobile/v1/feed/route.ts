import { MobileAuthError, withMobileAuth, mobileJson } from "@/lib/mobile-auth"
import { requireClientContext, requireCompetitiveInsights } from "@/lib/services/authz"
import {
  MOBILE_DONATION_PLATFORMS,
  decodeCursor,
  getFeedPage,
  type FeedFilters,
  type MobileDonationPlatform,
} from "@/lib/services/feed-service"

const MAX_ENTITY_FILTERS = 100

function parseDate(raw: string | null, endOfDay: boolean): Date | undefined {
  if (!raw) return undefined
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`)
    : new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new MobileAuthError(400, "INVALID_FILTER", "Date filters must be valid ISO dates")
  }
  return date
}

export function parseMobileFeedFilters(searchParams: URLSearchParams): FeedFilters {
  const entityIds = [...new Set(searchParams.getAll("entityId").filter(Boolean))]
  if (entityIds.length > MAX_ENTITY_FILTERS) {
    throw new MobileAuthError(400, "INVALID_FILTER", `Select no more than ${MAX_ENTITY_FILTERS} entities`)
  }

  const rawMessageType = searchParams.get("messageType")
  if (rawMessageType && rawMessageType !== "email" && rawMessageType !== "sms") {
    throw new MobileAuthError(400, "INVALID_FILTER", "messageType must be email or sms")
  }

  const rawPlatform = searchParams.get("donationPlatform")
  const validPlatforms = new Set<string>(MOBILE_DONATION_PLATFORMS.map((platform) => platform.value))
  if (rawPlatform && !validPlatforms.has(rawPlatform)) {
    throw new MobileAuthError(400, "INVALID_FILTER", "Unsupported donation platform")
  }

  const fromDate = parseDate(searchParams.get("fromDate"), false)
  const toDate = parseDate(searchParams.get("toDate"), true)
  if (fromDate && toDate && fromDate > toDate) {
    throw new MobileAuthError(400, "INVALID_FILTER", "fromDate must be before or equal to toDate")
  }

  return {
    search: searchParams.get("search") || undefined,
    entityIds: entityIds.length ? entityIds : undefined,
    party: searchParams.get("party") || undefined,
    state: searchParams.get("state") || undefined,
    entityType: searchParams.get("entityType") || undefined,
    messageType: (rawMessageType as "email" | "sms" | null) || undefined,
    thirdParty: searchParams.get("thirdParty") === "true",
    houseFileOnly: searchParams.get("houseFileOnly") === "true",
    donationPlatform: (rawPlatform as MobileDonationPlatform | null) || undefined,
    fromDate,
    toDate,
    tag: searchParams.get("tag") || undefined,
    subscriptionsOnly: searchParams.get("subscriptionsOnly") === "true",
  }
}

// GET /api/mobile/v1/feed — cursor-paginated campaign/message feed.
// Mirrors the web CI feed filters, except Office (not meaningful for this feed):
// search, entityId (repeatable), party, state, entityType, messageType, thirdParty,
// houseFileOnly, donationPlatform, fromDate, toDate, tag, subscriptionsOnly, cursor.
export const GET = withMobileAuth(async (request, ctx) => {
  requireCompetitiveInsights(ctx)
  const { clientId, plan } = requireClientContext(ctx)

  const url = new URL(request.url)
  const cursor = decodeCursor(url.searchParams.get("cursor"))

  const { items, nextCursor, hasMore } = await getFeedPage(
    clientId,
    plan,
    parseMobileFeedFilters(url.searchParams),
    cursor,
  )

  return mobileJson({ data: items, pagination: { nextCursor, hasMore } })
})
