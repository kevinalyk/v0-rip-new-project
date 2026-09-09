import assert from "node:assert/strict"
import test from "node:test"

import { parseDirectoryFilters } from "@/app/api/mobile/v1/entities/route"
import { MobileAuthError } from "@/lib/mobile-auth"
import { decodeDirectoryCursor, encodeDirectoryCursor } from "@/lib/services/directory-service"

test("normalizes Directory search and state filters", () => {
  const result = parseDirectoryFilters(
    new URLSearchParams("search=%20ann%20&party=republican&state=mo&entityType=candidate"),
  )
  assert.deepEqual(result, {
    search: "ann",
    party: "republican",
    state: "MO",
    entityType: "candidate",
  })
})

test("accepts unknown party and state filters", () => {
  assert.deepEqual(parseDirectoryFilters(new URLSearchParams("party=unknown&state=unknown")), {
    search: undefined,
    party: "unknown",
    state: "unknown",
    entityType: undefined,
  })
})

for (const query of [
  "party=libertarian",
  "state=XX",
  "entityType=data_broker",
  `search=${"x".repeat(101)}`,
]) {
  test(`rejects unsupported Directory query: ${query.slice(0, 40)}`, () => {
    assert.throws(
      () => parseDirectoryFilters(new URLSearchParams(query)),
      (error) => error instanceof MobileAuthError && error.code === "INVALID_FILTER",
    )
  })
}

test("round-trips a Directory cursor", () => {
  assert.deepEqual(decodeDirectoryCursor(encodeDirectoryCursor({ offset: 30 })), { offset: 30 })
})

test("rejects malformed Directory cursors", () => {
  assert.throws(
    () => decodeDirectoryCursor("not-a-cursor"),
    (error) => error instanceof MobileAuthError && error.code === "INVALID_CURSOR",
  )
})
