import { STATES } from "@/lib/campaign-filter-options"
import { MobileAuthError, mobileJson, withMobileAuth } from "@/lib/mobile-auth"
import { requireClientContext } from "@/lib/services/authz"
import {
  MOBILE_DIRECTORY_ENTITY_TYPES,
  MOBILE_DIRECTORY_PARTIES,
  decodeDirectoryCursor,
  listDirectoryEntities,
  type DirectoryFilters,
} from "@/lib/services/directory-service"

const MAX_SEARCH_LENGTH = 100

export function parseDirectoryFilters(searchParams: URLSearchParams): DirectoryFilters {
  const search = searchParams.get("search")?.trim() || undefined
  if (search && search.length > MAX_SEARCH_LENGTH) {
    throw new MobileAuthError(400, "INVALID_FILTER", `Search must be ${MAX_SEARCH_LENGTH} characters or fewer`)
  }

  const party = searchParams.get("party") || undefined
  const validParties = new Set<string>(MOBILE_DIRECTORY_PARTIES.map((option) => option.value))
  if (party && !validParties.has(party)) {
    throw new MobileAuthError(400, "INVALID_FILTER", "Unsupported party")
  }

  const state = searchParams.get("state") || undefined
  if (state && state !== "unknown" && !STATES.includes(state.toUpperCase())) {
    throw new MobileAuthError(400, "INVALID_FILTER", "Unsupported state")
  }

  const entityType = searchParams.get("entityType") || undefined
  const validTypes = new Set<string>(MOBILE_DIRECTORY_ENTITY_TYPES.map((option) => option.value))
  if (entityType && !validTypes.has(entityType)) {
    throw new MobileAuthError(400, "INVALID_FILTER", "Unsupported entity type")
  }

  return {
    search,
    party,
    state: state && state !== "unknown" ? state.toUpperCase() : state,
    entityType,
  }
}

// GET /api/mobile/v1/entities — searchable, filterable mobile Directory.
export const GET = withMobileAuth(async (request, ctx) => {
  const { clientId } = requireClientContext(ctx)
  const searchParams = new URL(request.url).searchParams
  const cursor = decodeDirectoryCursor(searchParams.get("cursor"))
  const result = await listDirectoryEntities(clientId, parseDirectoryFilters(searchParams), cursor)
  return mobileJson({
    data: result.entities,
    pagination: {
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      totalCount: result.totalCount,
    },
  })
})
