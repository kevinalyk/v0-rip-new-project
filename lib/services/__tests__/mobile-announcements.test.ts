import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { MobileAuthError } from "@/lib/mobile-auth"
import {
  announcementExcerpt,
  decodeAnnouncementCursor,
  encodeAnnouncementCursor,
} from "@/lib/services/announcement-service"

describe("mobile announcements", () => {
  it("builds a readable, length-limited excerpt from rich HTML", () => {
    const excerpt = announcementExcerpt(
      '<style>.hidden{display:none}</style><p>Fresh&nbsp;<strong>features</strong> &amp; fixes</p><script>alert("no")</script>',
      17,
    )
    assert.equal(excerpt, "Fresh features &…")
  })

  it("round-trips a valid cursor", () => {
    const cursor = { publishedAt: "2026-09-10T12:30:00.000Z", id: "announcement_123" }
    assert.deepEqual(decodeAnnouncementCursor(encodeAnnouncementCursor(cursor)), cursor)
  })

  it("accepts an absent cursor", () => {
    assert.equal(decodeAnnouncementCursor(null), null)
  })

  for (const raw of [
    "not-base64",
    Buffer.from("{}").toString("base64url"),
    Buffer.from(JSON.stringify({ publishedAt: "nope", id: "a" })).toString("base64url"),
  ]) {
    it(`rejects malformed cursor ${raw}`, () => {
      assert.throws(
        () => decodeAnnouncementCursor(raw),
        (error: unknown) =>
          error instanceof MobileAuthError && error.status === 400 && error.code === "INVALID_CURSOR",
      )
    })
  }
})
