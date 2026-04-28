/**
 * Directory routing utilities for SEO landing pages.
 *
 * The directory supports clean, path-based URLs for popular filter combinations:
 *   /directory                          → all entities
 *   /directory/republicans              → all Republicans
 *   /directory/texas                    → all entities in Texas
 *   /directory/texas/republicans        → Texas Republicans
 *
 * Less popular filters (type, search) fall back to query params:
 *   /directory/texas/republicans?type=pac
 *   /directory?search=donald
 *
 * This file exposes constants and helpers for parsing slugs, validating
 * combinations, and building canonical URLs from a filter set.
 */

// ──────────────────────────────────────────────────────────────────────────────
// State definitions
// ──────────────────────────────────────────────────────────────────────────────

// Abbreviation → full name (used as the canonical "state" filter value internally)
export const STATE_ABBREV_TO_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
}

// Full name → abbreviation
export const STATE_NAME_TO_ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBREV_TO_NAME).map(([k, v]) => [v, k])
)

// URL slug → abbreviation (e.g. "texas" → "TX", "new-york" → "NY")
export const STATE_SLUG_TO_ABBREV: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_ABBREV_TO_NAME).map(([abbrev, name]) => [
    name.toLowerCase().replace(/\s+/g, "-"),
    abbrev,
  ])
)

// Abbreviation → URL slug (e.g. "TX" → "texas")
export const STATE_ABBREV_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_SLUG_TO_ABBREV).map(([slug, abbrev]) => [abbrev, slug])
)

// All valid state slugs as a Set for fast lookup
export const STATE_SLUGS = new Set(Object.keys(STATE_SLUG_TO_ABBREV))

// ──────────────────────────────────────────────────────────────────────────────
// Party definitions
// ──────────────────────────────────────────────────────────────────────────────

// URL slug → internal party value used by the API filter
export const PARTY_SLUG_TO_VALUE: Record<string, string> = {
  republicans: "republican",
  democrats: "democrat",
  independents: "independent",
}

// Internal party value → URL slug
export const PARTY_VALUE_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(PARTY_SLUG_TO_VALUE).map(([slug, value]) => [value, slug])
)

// Display labels (capitalized, plural for headings/copy)
export const PARTY_SLUG_TO_LABEL: Record<string, string> = {
  republicans: "Republicans",
  democrats: "Democrats",
  independents: "Independents",
}

// Singular adjective form for natural copy ("Texas Republican candidates")
export const PARTY_SLUG_TO_ADJECTIVE: Record<string, string> = {
  republicans: "Republican",
  democrats: "Democratic",
  independents: "Independent",
}

export const PARTY_SLUGS = new Set(Object.keys(PARTY_SLUG_TO_VALUE))

// ──────────────────────────────────────────────────────────────────────────────
// Slug detection helpers
// ──────────────────────────────────────────────────────────────────────────────

export function isStateSlug(slug: string): boolean {
  return STATE_SLUGS.has(slug.toLowerCase())
}

export function isPartySlug(slug: string): boolean {
  return PARTY_SLUGS.has(slug.toLowerCase())
}

/**
 * Resolve a URL slug to its filter value.
 * Returns the abbreviation for state slugs, the internal value for party slugs,
 * or null if the slug doesn't match either.
 */
export function resolveSlug(slug: string): { kind: "state"; abbrev: string; name: string } | { kind: "party"; value: string; slug: string } | null {
  const lower = slug.toLowerCase()
  if (STATE_SLUGS.has(lower)) {
    const abbrev = STATE_SLUG_TO_ABBREV[lower]
    return { kind: "state", abbrev, name: STATE_ABBREV_TO_NAME[abbrev] }
  }
  if (PARTY_SLUGS.has(lower)) {
    return { kind: "party", value: PARTY_SLUG_TO_VALUE[lower], slug: lower }
  }
  return null
}

// ──────────────────────────────────────────────────────────────────────────────
// URL building
// ──────────────────────────────────────────────────────────────────────────────

interface DirectoryFilters {
  /** State filter as an abbreviation (e.g. "TX") or "all" */
  state?: string
  /** Party filter as the internal value (e.g. "republican") or "all" */
  party?: string
  /** Entity type filter (e.g. "pac") or "all" */
  type?: string
  /** Search query */
  search?: string
}

/**
 * Build the canonical URL for a given set of directory filters.
 *
 * State and party use clean path segments; type and search use query params.
 * Returns a path starting with "/directory".
 */
export function buildDirectoryUrl(filters: DirectoryFilters): string {
  const stateSlug =
    filters.state && filters.state !== "all" && filters.state !== "unknown"
      ? STATE_ABBREV_TO_SLUG[filters.state]
      : null

  const partySlug =
    filters.party && filters.party !== "all" && filters.party !== "unknown"
      ? PARTY_VALUE_TO_SLUG[filters.party.toLowerCase()]
      : null

  let path = "/directory"
  if (stateSlug && partySlug) {
    path = `/directory/${stateSlug}/${partySlug}`
  } else if (stateSlug) {
    path = `/directory/${stateSlug}`
  } else if (partySlug) {
    path = `/directory/${partySlug}`
  }

  const params = new URLSearchParams()
  if (filters.type && filters.type !== "all") params.set("type", filters.type)
  if (filters.search?.trim()) params.set("search", filters.search.trim())

  const query = params.toString()
  return query ? `${path}?${query}` : path
}
