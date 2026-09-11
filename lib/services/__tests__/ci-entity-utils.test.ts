import assert from "node:assert/strict"
import test from "node:test"

import {
  isSharedEspDomain,
  extractRootDomain,
  extractCtaDomainKey,
  isSharedCtaPlatformHostname,
  findEntityForSender,
  findEntityByCtaDomain,
  addEntityMapping,
  SHARED_ESP_DOMAINS,
  SHARED_CTA_PLATFORM_HOSTNAMES,
} from "@/lib/ci-entity-utils"
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

// ─── Shared CTA-platform hostname detection ─────────────────────────────────
// Mirrors isSharedEspDomain, but for CTA links: a bare-hostname mapping on a
// shared fundraising platform (Donorbox, GoFundMe, etc.) would otherwise match
// every campaign hosted on it, not just the one the mapping was created for.

test("isSharedCtaPlatformHostname flags known shared fundraising-platform hostnames", () => {
  assert.equal(isSharedCtaPlatformHostname("donorbox.org"), true)
  assert.equal(isSharedCtaPlatformHostname("gofundme.com"), true)
})

test("isSharedCtaPlatformHostname is case-insensitive", () => {
  assert.equal(isSharedCtaPlatformHostname("Donorbox.org"), true)
  assert.equal(isSharedCtaPlatformHostname("DONORBOX.ORG"), true)
})

test("isSharedCtaPlatformHostname does not flag a candidate's own domain", () => {
  assert.equal(isSharedCtaPlatformHostname("support.johnkennedy.com"), false)
})

test("isSharedCtaPlatformHostname handles null/undefined/empty input safely", () => {
  assert.equal(isSharedCtaPlatformHostname(null), false)
  assert.equal(isSharedCtaPlatformHostname(undefined), false)
  assert.equal(isSharedCtaPlatformHostname(""), false)
})

test("SHARED_CTA_PLATFORM_HOSTNAMES entries are all stored lowercase", () => {
  for (const hostname of SHARED_CTA_PLATFORM_HOSTNAMES) {
    assert.equal(hostname, hostname.toLowerCase(), `${hostname} should be stored lowercase`)
  }
})

// ─── findEntityByCtaDomain: exact path vs. shared-platform hostname fallback ─
// These exercise the actual matching branches (not just the pure key-extraction
// helpers above) using an injected mock Prisma client, per the fix for the
// hostname-fallback safety gap.

test("findEntityByCtaDomain: exact campaign path never matches a different campaign on the same shared platform", async () => {
  const mockDb = {
    ciEntityMapping: {
      findFirst: async ({ where }: any) => {
        const keys = where.ctaDomain.in as string[]
        // Only "campaign-a" has a mapping; "campaign-b" must never match it.
        return keys.includes("donorbox.org/campaign-a") ? { entityId: "entity-a" } : null
      },
    },
  }

  const resultB = await findEntityByCtaDomain(["https://donorbox.org/campaign-b"], mockDb as any)
  assert.equal(resultB, null)

  const resultA = await findEntityByCtaDomain(["https://donorbox.org/campaign-a"], mockDb as any)
  assert.deepEqual(resultA, { entityId: "entity-a", assignmentMethod: "auto_cta_domain" })
})

test("findEntityByCtaDomain: a bare shared-platform hostname mapping is never used as a fallback", async () => {
  let bareHostnameQueried = false
  const mockDb = {
    ciEntityMapping: {
      findFirst: async ({ where }: any) => {
        const keys = where.ctaDomain.in as string[]
        if (keys.includes("donorbox.org")) {
          bareHostnameQueried = true
          return { entityId: "entity-wrong" } // would incorrectly match if the fallback ran
        }
        return null // no exact hostname+path mapping exists for this campaign
      },
    },
  }

  const result = await findEntityByCtaDomain(["https://donorbox.org/some-campaign"], mockDb as any)
  assert.equal(result, null, "a bare 'donorbox.org' mapping must never be used as a fallback match")
  assert.equal(bareHostnameQueried, false, "the bare shared-platform hostname must never even be queried")
})

test("findEntityByCtaDomain: a safe entity-owned hostname still works as a fallback", async () => {
  const mockDb = {
    ciEntityMapping: {
      findFirst: async ({ where }: any) => {
        const keys = where.ctaDomain.in as string[]
        return keys.includes("support.johnkennedy.com") ? { entityId: "entity-kennedy" } : null
      },
    },
  }

  const result = await findEntityByCtaDomain(["https://support.johnkennedy.com/donate?amt=25"], mockDb as any)
  assert.deepEqual(result, { entityId: "entity-kennedy", assignmentMethod: "auto_cta_domain" })
})

test("findEntityByCtaDomain: exact hostname+path takes precedence over hostname fallback", async () => {
  const mockDb = {
    ciEntityMapping: {
      findFirst: async ({ where }: any) => {
        const keys = where.ctaDomain.in as string[]
        if (keys.includes("support.johnkennedy.com/donate")) return { entityId: "entity-exact" }
        if (keys.includes("support.johnkennedy.com")) return { entityId: "entity-fallback" }
        return null
      },
    },
  }

  const result = await findEntityByCtaDomain(["https://support.johnkennedy.com/donate"], mockDb as any)
  assert.deepEqual(result, { entityId: "entity-exact", assignmentMethod: "auto_cta_domain" })
})

// ─── Shared-ESP matching/database branches (mocked Prisma) ──────────────────
// The earlier isSharedEspDomain tests above only exercise the pure predicate.
// These exercise the actual query and mapping-creation branches that predicate
// gates, using an injected mock Prisma client — proving the Jimmy Skovgard /
// no-reply@substack.com incident's root cause can't recur.

test("findEntityForSender: an exact senderEmail mapping on a shared ESP matches", async () => {
  const email = "jimskovgard@substack.com"
  let findFirstCalls = 0
  const mockDb = {
    ciEntityMapping: {
      findFirst: async ({ where }: any) => {
        findFirstCalls++
        return where.senderEmail === email ? { entityId: "entity-skovgard", entity: null } : null
      },
    },
    ciEntity: { findMany: async () => [] },
  }

  const result = await findEntityForSender(email, undefined, undefined, undefined, undefined, mockDb as any)
  assert.deepEqual(result, { entityId: "entity-skovgard", assignmentMethod: "auto_domain" })
  assert.equal(findFirstCalls, 1, "only the exact-email lookup should run — no senderDomain fallback query")
})

test("findEntityForSender: a senderDomain mapping is never queried for a shared ESP domain", async () => {
  const queriedWhereClauses: any[] = []
  const mockDb = {
    ciEntityMapping: {
      findFirst: async ({ where }: any) => {
        queriedWhereClauses.push(where)
        return null // no exact email mapping exists either
      },
    },
    ciEntity: { findMany: async () => [] },
  }

  await findEntityForSender("random-author@substack.com", undefined, undefined, undefined, undefined, mockDb as any)

  for (const where of queriedWhereClauses) {
    assert.equal(
      where.senderDomain,
      undefined,
      `senderDomain must never be queried for a shared ESP domain, got: ${JSON.stringify(where)}`,
    )
  }
})

test("findEntityForSender: assigning one Substack sender does not select or assign another Substack sender", async () => {
  const mockDb = {
    ciEntityMapping: {
      findFirst: async () => null, // no email/domain mapping exists
    },
    ciEntity: {
      findMany: async () => [
        { id: "entity-gillibrand", name: "Kirsten Gillibrand", donationIdentifiers: { substack: "kirstengillibrand" } },
      ],
    },
  }

  const result = await findEntityForSender(
    "jimskovgard@substack.com",
    undefined,
    undefined,
    undefined,
    undefined,
    mockDb as any,
  )
  assert.equal(result, null, "an unrelated Substack sender must not match another sender's donationIdentifiers.substack handle")
})

test("addEntityMapping: stores an exact shared-ESP email mapping with senderDomain: null", async () => {
  let created: any = null
  const mockDb = {
    ciEntityMapping: {
      findFirst: async () => null, // no existing mapping
      create: async (args: any) => {
        created = args.data
        return { id: "mapping-x", ...args.data }
      },
    },
  }

  const result = await addEntityMapping("entity-1", "jimskovgard@substack.com", mockDb as any)
  assert.equal(result.success, true)
  assert.deepEqual(created, { entityId: "entity-1", senderEmail: "jimskovgard@substack.com", senderDomain: null })
})

test("addEntityMapping: rejects a bare shared-ESP domain before ever touching the database", async () => {
  const mockDb = {
    ciEntityMapping: {
      findFirst: async () => {
        throw new Error("should never query the database for a rejected mapping")
      },
      create: async () => {
        throw new Error("should never create a rejected mapping")
      },
    },
  }

  const result = await addEntityMapping("entity-1", "substack.com", mockDb as any)
  assert.equal(result.success, false)
  assert.match(result.error!, /shared email platform/i)
})
