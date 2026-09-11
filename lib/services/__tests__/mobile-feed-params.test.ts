import assert from "node:assert/strict"
import test from "node:test"

import { parseMobileFeedFilters } from "@/app/api/mobile/v1/feed/route"
import { MobileAuthError } from "@/lib/mobile-auth"
import { MOBILE_ENTITY_TYPES, normalizeMobileCtaLinks } from "@/lib/services/feed-service"

function expectInvalid(params: URLSearchParams) {
  assert.throws(
    () => parseMobileFeedFilters(params),
    (error: unknown) => error instanceof MobileAuthError && error.code === "INVALID_FILTER",
  )
}

test("parses the web-parity mobile feed filters and repeatable entity IDs", () => {
  const params = new URLSearchParams([
    ["search", "fundraising"],
    ["entityId", "entity-1"],
    ["entityId", "entity-2"],
    ["party", "republican"],
    ["state", "TX"],
    ["entityType", "politician"],
    ["messageType", "email"],
    ["thirdParty", "true"],
    ["donationPlatform", "winred"],
    ["fromDate", "2026-08-01"],
    ["toDate", "2026-09-06"],
    ["subscriptionsOnly", "true"],
  ])

  const filters = parseMobileFeedFilters(params)
  assert.deepEqual(filters.entityIds, ["entity-1", "entity-2"])
  assert.equal(filters.messageType, "email")
  assert.equal(filters.thirdParty, true)
  assert.equal(filters.houseFileOnly, false)
  assert.equal(filters.donationPlatform, "winred")
  assert.equal(filters.fromDate?.toISOString(), "2026-08-01T00:00:00.000Z")
  assert.equal(filters.toDate?.toISOString(), "2026-09-06T23:59:59.999Z")
})

test("deduplicates repeated entity IDs", () => {
  const filters = parseMobileFeedFilters(new URLSearchParams([
    ["entityId", "entity-1"],
    ["entityId", "entity-1"],
  ]))
  assert.deepEqual(filters.entityIds, ["entity-1"])
})

test("rejects unsupported message types and donation platforms", () => {
  expectInvalid(new URLSearchParams({ messageType: "push" }))
  expectInvalid(new URLSearchParams({ donationPlatform: "unknown" }))
})

test("rejects malformed or reversed date ranges", () => {
  expectInvalid(new URLSearchParams({ fromDate: "not-a-date" }))
  expectInvalid(new URLSearchParams({ fromDate: "2026-09-06", toDate: "2026-08-01" }))
})

test("rejects more than 100 selected entities", () => {
  const params = new URLSearchParams()
  for (let index = 0; index < 101; index++) params.append("entityId", `entity-${index}`)
  expectInvalid(params)
})

test("exposes nonprofit and state-party feed filters", () => {
  assert.deepEqual(
    MOBILE_ENTITY_TYPES.slice(-2),
    [
      { value: "nonprofit", label: "Nonprofits" },
      { value: "state_party", label: "State Parties" },
    ],
  )
})

test("normalizes direct and JSON-string CTA arrays without throwing on malformed data", () => {
  const links = [{ url: "https://wrapped.example.com", finalUrl: "https://example.com/final" }]

  assert.deepEqual(normalizeMobileCtaLinks(links), links)
  assert.deepEqual(normalizeMobileCtaLinks(JSON.stringify(links)), links)
  assert.deepEqual(normalizeMobileCtaLinks("not-json"), [])
  assert.deepEqual(normalizeMobileCtaLinks({ links }), [])
})
