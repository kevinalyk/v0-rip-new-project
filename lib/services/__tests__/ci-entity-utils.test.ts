import assert from "node:assert/strict"
import test from "node:test"

import { isSharedEspDomain, extractRootDomain, extractCtaDomainKey, SHARED_ESP_DOMAINS } from "@/lib/ci-entity-utils"
import { CI_API_LIMITS } from "@/lib/ci-api-auth"
import { ENTITY_TYPE_FILTER_VALUES, isValidEntityTypeFilter } from "@/lib/slack-message-filters"

// ─── Shared ESP domain detection ────────────────────────────────────────────
// This is the guard that prevents the Jimmy Skovgard / no-reply@substack.com
// incident from recurring: a domain-level mapping on a shared ESP silently
// routes every other sender on that platform to whichever entity got mapped
// first.

test("isSharedEspDomain flags known shared email-provider domains", () => {
  assert.equal(isSharedEspDomain("substack.com"), true)
  assert.equal(isSharedEspDomain("mailchimp.com"), true)
  assert.equal(isSharedEspDomain("sendgrid.net"), true)
  assert.equal(isSharedEspDomain("constantcontact.com"), true)
  assert.equal(isSharedEspDomain("hubspotemail.net"), true)
  assert.equal(isSharedEspDomain("mailgun.org"), true)
  assert.equal(isSharedEspDomain("amazonses.com"), true)
  assert.equal(isSharedEspDomain("sparkpostmail.com"), true)
  assert.equal(isSharedEspDomain("actionnetwork.org"), true)
  assert.equal(isSharedEspDomain("salsalabs.org"), true)
})

test("isSharedEspDomain is case-insensitive", () => {
  assert.equal(isSharedEspDomain("Substack.com"), true)
  assert.equal(isSharedEspDomain("SUBSTACK.COM"), true)
})

test("isSharedEspDomain does not flag a candidate's own infrastructure domain", () => {
  assert.equal(isSharedEspDomain("support.johnkennedy.com"), false)
  assert.equal(isSharedEspDomain("mail.somecampaign.com"), false)
})

test("isSharedEspDomain handles null/undefined/empty input safely", () => {
  assert.equal(isSharedEspDomain(null), false)
  assert.equal(isSharedEspDomain(undefined), false)
  assert.equal(isSharedEspDomain(""), false)
})

test("SHARED_ESP_DOMAINS contains no accidental duplicates and only the intended hosts", () => {
  const expected = [
    "substack.com",
    "mailchimp.com",
    "mailchimpapp.net",
    "sendgrid.net",
    "constantcontact.com",
    "hubspotemail.net",
    "mailgun.org",
    "amazonses.com",
    "sparkpostmail.com",
    "actionnetwork.org",
    "salsalabs.org",
  ]
  assert.equal(SHARED_ESP_DOMAINS.size, expected.length)
  for (const domain of expected) {
    assert.equal(SHARED_ESP_DOMAINS.has(domain), true, `expected ${domain} to be present`)
  }
  for (const domain of SHARED_ESP_DOMAINS) {
    assert.equal(domain, domain.toLowerCase(), `${domain} should be stored lowercase`)
  }
})

// ─── CTA URL matching: hostname+path vs. bare-hostname fallback ────────────
// Many fundraising platforms (Donorbox, GoFundMe, etc.) host thousands of
// unrelated campaigns on one shared hostname, so the match key must include
// the path — but pre-existing mappings on a candidate's own domain (no path)
// must keep matching every page on that domain.

test("extractRootDomain returns just the lowercased hostname, no path", () => {
  assert.equal(extractRootDomain("https://Donorbox.org/children-of-the-usa"), "donorbox.org")
  assert.equal(extractRootDomain("https://support.johnkennedy.com/donate?amt=25"), "support.johnkennedy.com")
})

test("extractRootDomain returns null for an unparseable URL", () => {
  assert.equal(extractRootDomain("not a url"), null)
})

test("extractCtaDomainKey preserves hostname+path for platform campaign pages", () => {
  assert.equal(extractCtaDomainKey("https://donorbox.org/children-of-the-usa"), "donorbox.org/children-of-the-usa")
})

test("extractCtaDomainKey distinguishes two different campaigns on the same shared host", () => {
  const keyA = extractCtaDomainKey("https://donorbox.org/children-of-the-usa")
  const keyB = extractCtaDomainKey("https://donorbox.org/some-other-cause")
  assert.notEqual(keyA, keyB)
})

test("extractCtaDomainKey strips query string, fragment, and trailing slash", () => {
  assert.equal(
    extractCtaDomainKey("https://donorbox.org/children-of-the-usa/?utm_source=email#top"),
    "donorbox.org/children-of-the-usa",
  )
})

test("extractCtaDomainKey falls back to bare hostname when the URL has no path", () => {
  assert.equal(extractCtaDomainKey("https://support.johnkennedy.com"), "support.johnkennedy.com")
  assert.equal(extractCtaDomainKey("https://support.johnkennedy.com/"), "support.johnkennedy.com")
})

test("extractCtaDomainKey lowercases the path so matching is case-insensitive", () => {
  assert.equal(extractCtaDomainKey("https://Donorbox.org/Children-Of-The-USA"), "donorbox.org/children-of-the-usa")
})

test("extractCtaDomainKey returns null for an unparseable URL", () => {
  assert.equal(extractCtaDomainKey("not a url"), null)
})

// ─── MCP entity creation rate limit ─────────────────────────────────────────
// The 20/day cap was removed so Claude's autonomous CI assignment workflow
// is never blocked mid-session.

test("MAX_NEW_ENTITIES_PER_DAY has no finite cap", () => {
  assert.equal(CI_API_LIMITS.MAX_NEW_ENTITIES_PER_DAY, Number.POSITIVE_INFINITY)
  // Any realistic daily count must never be able to reach/exceed this limit.
  assert.equal(100_000 >= CI_API_LIMITS.MAX_NEW_ENTITIES_PER_DAY, false)
})

// ─── Nonprofit / State Party entity type support ───────────────────────────
// These types must be usable everywhere entity types are filtered/validated,
// not just where entities are created (the earlier inconsistency bug).

test("ENTITY_TYPE_FILTER_VALUES includes nonprofit and state_party alongside the original types", () => {
  assert.deepEqual(ENTITY_TYPE_FILTER_VALUES, ["all", "politician", "pac", "organization", "nonprofit", "state_party"])
})

test("isValidEntityTypeFilter accepts nonprofit and state_party", () => {
  assert.equal(isValidEntityTypeFilter("nonprofit"), true)
  assert.equal(isValidEntityTypeFilter("state_party"), true)
})

test("isValidEntityTypeFilter rejects unknown entity types", () => {
  assert.equal(isValidEntityTypeFilter("data_broker"), false)
  assert.equal(isValidEntityTypeFilter("nonprofit-org"), false)
  assert.equal(isValidEntityTypeFilter(123), false)
})
