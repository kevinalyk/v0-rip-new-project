// Shared allowed-value lists and matching logic for the message-level Slack alert filters
// (SlackIntegration / SlackChannel: messageTypeFilter, houseFileFilter, partyFilter,
// stateFilter, entityTypeFilter). Mirrors the same dimensions as the CI Feed's own filters
// (components/competitive-insights.tsx + app/api/competitive-insights/route.ts) so Slack
// alerts and the CI Feed behave consistently, including the "third party" dropdown value
// matching "third party" / "independent" / "ind" in the DB.
//
// Used by:
//   - lib/slack-alerts.ts (matchesMessageFilters - applied per outgoing alert)
//   - app/api/slack/message-filters/route.ts, app/api/slack/bots/[id]/route.ts (validation)
//   - components/slack-message-filters.tsx (dropdown options)

export const MESSAGE_TYPE_FILTER_VALUES = ["all", "email", "sms"] as const
export const HOUSE_FILE_FILTER_VALUES = ["all", "house_file", "third_party"] as const
export const PARTY_FILTER_VALUES = ["all", "republican", "democrat", "third party"] as const
export const ENTITY_TYPE_FILTER_VALUES = ["all", "politician", "pac", "organization"] as const

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
]

export type MessageTypeFilter = (typeof MESSAGE_TYPE_FILTER_VALUES)[number]
export type HouseFileFilter = (typeof HOUSE_FILE_FILTER_VALUES)[number]
export type PartyFilter = (typeof PARTY_FILTER_VALUES)[number]
export type EntityTypeFilter = (typeof ENTITY_TYPE_FILTER_VALUES)[number]

export interface MessageFilterValues {
  messageTypeFilter: string
  houseFileFilter: string
  partyFilter: string
  stateFilter: string
  entityTypeFilter: string
}

export function isValidMessageTypeFilter(value: unknown): value is MessageTypeFilter {
  return typeof value === "string" && (MESSAGE_TYPE_FILTER_VALUES as readonly string[]).includes(value)
}

export function isValidHouseFileFilter(value: unknown): value is HouseFileFilter {
  return typeof value === "string" && (HOUSE_FILE_FILTER_VALUES as readonly string[]).includes(value)
}

export function isValidPartyFilter(value: unknown): value is PartyFilter {
  return typeof value === "string" && (PARTY_FILTER_VALUES as readonly string[]).includes(value)
}

export function isValidStateFilter(value: unknown): value is string {
  return typeof value === "string" && (value === "all" || (US_STATES as readonly string[]).includes(value))
}

export function isValidEntityTypeFilter(value: unknown): value is EntityTypeFilter {
  return typeof value === "string" && (ENTITY_TYPE_FILTER_VALUES as readonly string[]).includes(value)
}

// "third party" dropdown value should match "third party", "independent", and "ind" on the
// entity row - same synonym set app/api/competitive-insights/route.ts uses for the party filter.
const THIRD_PARTY_SYNONYMS = new Set(["third party", "independent", "ind"])

export interface MessageFilterContext {
  kind: "email" | "sms"
  /** Frozen at ingestion/assignment time - see lib/ci-mapping-cache.ts. */
  isThirdParty: boolean
  entityParty: string | null
  entityState: string | null
  entityType: string
}

/**
 * True if a single message/alert passes all five filter dimensions on a Slack target
 * (SlackIntegration or SlackChannel row). Every dimension defaults to "all", which always
 * passes - so a target with no filters configured behaves exactly as before this feature
 * shipped.
 */
export function matchesMessageFilters(target: MessageFilterValues, ctx: MessageFilterContext): boolean {
  if (target.messageTypeFilter !== "all" && target.messageTypeFilter !== ctx.kind) {
    return false
  }

  if (target.houseFileFilter === "house_file" && ctx.isThirdParty) {
    return false
  }
  if (target.houseFileFilter === "third_party" && !ctx.isThirdParty) {
    return false
  }

  if (target.partyFilter !== "all") {
    const entityParty = (ctx.entityParty ?? "").toLowerCase()
    if (target.partyFilter === "third party") {
      if (!THIRD_PARTY_SYNONYMS.has(entityParty)) return false
    } else if (entityParty !== target.partyFilter) {
      return false
    }
  }

  if (target.stateFilter !== "all" && (ctx.entityState ?? "").toLowerCase() !== target.stateFilter.toLowerCase()) {
    return false
  }

  if (target.entityTypeFilter !== "all" && ctx.entityType.toLowerCase() !== target.entityTypeFilter.toLowerCase()) {
    return false
  }

  return true
}
