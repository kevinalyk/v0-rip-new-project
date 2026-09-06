/**
 * Integration tests for lib/services/feed-service.ts covering the acceptance criteria
 * in v0_plans/prime-route.md's revision pass: access-scope correctness (no cross-client
 * personal-record leakage), retention/plan history limits, processed-SMS gating, tag +
 * subscriptionsOnly + search filters, cursor pagination, and malformed-cursor handling.
 *
 * IMPORTANT: hits whatever database DATABASE_URL points to; creates and tears down its
 * own Client/CiEntity/CompetitiveInsightCampaign/SmsQueue/EntityTag/CiEntitySubscription
 * fixtures, id-prefixed with MOBILE_FEED_TEST_. Do not point DATABASE_URL at production.
 *
 * Run with: npx tsx lib/services/__tests__/mobile-feed.test.ts
 */
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.development.local" })

import prisma from "@/lib/prisma"
import { MobileAuthError } from "@/lib/mobile-auth"
import { decodeCursor, getFeedItemById, getFeedPage } from "@/lib/services/feed-service"
import type { SubscriptionPlan } from "@/lib/subscription-utils"

const PREFIX = "MOBILE_FEED_TEST_"
// "all" (Professional) has unlimited CI history — used throughout so retention-window
// assertions below are exercised against Client.dataRetentionDays, not the plan's own
// (here: unlimited) history cap.
const PLAN: SubscriptionPlan = "all"
let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    passed++
    console.log(`  ok  - ${name}`)
  } catch (error) {
    failed++
    console.error(`FAIL  - ${name}`)
    console.error(error instanceof Error ? `        ${error.message}` : error)
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`)
}

async function expectMobileError(fn: () => unknown, expectedCode: string) {
  try {
    fn()
    throw new Error(`Expected MobileAuthError(${expectedCode}) but no error was thrown`)
  } catch (error) {
    if (error instanceof MobileAuthError) {
      assert(error.code === expectedCode, `expected code ${expectedCode}, got ${error.code}`)
      return
    }
    throw error
  }
}

async function cleanup() {
  await prisma.entityTag.deleteMany({ where: { clientId: { startsWith: PREFIX } } })
  await prisma.ciEntitySubscription.deleteMany({ where: { clientId: { startsWith: PREFIX } } })
  await prisma.competitiveInsightCampaign.deleteMany({ where: { senderName: { startsWith: PREFIX } } })
  await prisma.smsQueue.deleteMany({ where: { message: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX.toLowerCase() } } })
  await prisma.ciEntity.deleteMany({ where: { name: { startsWith: PREFIX } } })
  await prisma.client.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function main() {
  await cleanup()

  const clientA = await prisma.client.create({
    data: { id: `${PREFIX}client_a`, name: `${PREFIX}Client A`, slug: `${PREFIX.toLowerCase()}client-a`, active: true, subscriptionPlan: PLAN, dataRetentionDays: 90 },
  })
  const clientB = await prisma.client.create({
    data: { id: `${PREFIX}client_b`, name: `${PREFIX}Client B`, slug: `${PREFIX.toLowerCase()}client-b`, active: true, subscriptionPlan: PLAN, dataRetentionDays: 90 },
  })
  const clientTightRetention = await prisma.client.create({
    data: {
      id: `${PREFIX}client_tight`,
      name: `${PREFIX}Client Tight Retention`,
      slug: `${PREFIX.toLowerCase()}client-tight`,
      active: true,
      subscriptionPlan: PLAN,
      dataRetentionDays: 1, // stricter than the "all" plan's unlimited CI history
    },
  })

  const entity = await prisma.ciEntity.create({
    data: { name: `${PREFIX}Shared Entity`, type: "politician", party: "republican", state: "TX" },
  })
  const otherEntity = await prisma.ciEntity.create({
    data: { name: `${PREFIX}Other Entity`, type: "pac", party: "democrat", state: "CA" },
  })
  const dataBrokerEntity = await prisma.ciEntity.create({
    data: { name: `${PREFIX}Data Broker Entity`, type: "data_broker" },
  })

  try {
    // ── Access scope: shared (entity-assigned) vs personal records ───────────
    const sharedCampaign = await prisma.competitiveInsightCampaign.create({
      data: {
        entityId: entity.id,
        senderName: `${PREFIX}shared_sender`,
        senderEmail: "shared@example.com",
        subject: "Shared campaign",
        dateReceived: new Date(),
        inboxRate: 100,
      },
    })
    const personalCampaignA = await prisma.competitiveInsightCampaign.create({
      data: {
        clientId: clientA.id,
        senderName: `${PREFIX}personal_sender_a`,
        senderEmail: "personal-a@example.com",
        subject: "Personal capture for client A",
        dateReceived: new Date(),
        inboxRate: 100,
        source: "personal",
      },
    })
    const dataBrokerCampaign = await prisma.competitiveInsightCampaign.create({
      data: {
        entityId: dataBrokerEntity.id,
        senderName: `${PREFIX}broker_sender`,
        senderEmail: "broker@example.com",
        subject: "Data broker campaign",
        dateReceived: new Date(),
        inboxRate: 100,
      },
    })

    await test("feed listing includes shared (entity-assigned) campaigns for any client", async () => {
      const { items } = await getFeedPage(clientB.id, PLAN, {}, null)
      assert(items.some((i) => i.id === sharedCampaign.id), "shared campaign should appear for a non-owning client")
    })

    await test("feed listing never includes a client's own personal (unassigned) capture", async () => {
      const { items } = await getFeedPage(clientA.id, PLAN, {}, null)
      assert(
        !items.some((i) => i.id === personalCampaignA.id),
        "personal capture must not appear in the shared feed listing, even for its own client",
      )
    })

    await test("feed listing excludes campaigns assigned to a data_broker entity", async () => {
      const { items } = await getFeedPage(clientA.id, PLAN, {}, null)
      assert(!items.some((i) => i.id === dataBrokerCampaign.id), "data_broker campaigns must be excluded")
    })

    await test("getFeedItemById: a client's own personal capture is visible to itself only", async () => {
      const ownView = await getFeedItemById(clientA.id, PLAN, personalCampaignA.id, "email")
      assert(ownView !== null, "owning client should see its own personal capture")
      const otherView = await getFeedItemById(clientB.id, PLAN, personalCampaignA.id, "email")
      assert(otherView === null, "a different client must not see another client's personal capture")
    })

    await test("getFeedItemById: shared campaigns are visible to any client", async () => {
      const view = await getFeedItemById(clientB.id, PLAN, sharedCampaign.id, "email")
      assert(view !== null, "shared campaign should be visible to any client")
    })

    await test("getFeedItemById: a data_broker-assigned campaign is not visible to a non-owning client", async () => {
      const view = await getFeedItemById(clientA.id, PLAN, dataBrokerCampaign.id, "email")
      assert(view === null, "data_broker campaigns should not be exposed as shared items")
    })

    // ── subscriptionsOnly: empty vs populated follow list ─────────────────────
    await test("subscriptionsOnly=true with zero follows returns an empty feed, not the full feed", async () => {
      const { items } = await getFeedPage(clientB.id, PLAN, { subscriptionsOnly: true }, null)
      assert(items.length === 0, "a client following nothing should see nothing with subscriptionsOnly=true")
    })

    await test("subscriptionsOnly=true with a follow returns only that entity's items", async () => {
      await prisma.ciEntitySubscription.create({ data: { clientId: clientB.id, entityId: entity.id } })
      const otherEntityCampaign = await prisma.competitiveInsightCampaign.create({
        data: {
          entityId: otherEntity.id,
          senderName: `${PREFIX}other_entity_sender`,
          senderEmail: "other-entity@example.com",
          subject: "Other entity campaign",
          dateReceived: new Date(),
          inboxRate: 100,
        },
      })
      try {
        const { items } = await getFeedPage(clientB.id, PLAN, { subscriptionsOnly: true }, null)
        assert(items.some((i) => i.id === sharedCampaign.id), "followed entity's campaign should appear")
        assert(!items.some((i) => i.id === otherEntityCampaign.id), "un-followed entity's campaign should not appear")
      } finally {
        await prisma.competitiveInsightCampaign.delete({ where: { id: otherEntityCampaign.id } })
        await prisma.ciEntitySubscription.deleteMany({ where: { clientId: clientB.id, entityId: entity.id } })
      }
    })

    // ── Tag filter ─────────────────────────────────────────────────────────────
    await test("tag filter is scoped per-client and restricts the feed to tagged entities", async () => {
      const taggingUser = await prisma.user.create({
        data: { email: `${PREFIX.toLowerCase()}tagger@example.com`, password: "hashed", clientId: clientA.id, firstLogin: false },
      })
      await prisma.entityTag.create({
        data: { clientId: clientA.id, entityId: entity.id, tagName: "watchlist", tagColor: "#FF0000", createdBy: taggingUser.id },
      })
      try {
        const tagged = await getFeedPage(clientA.id, PLAN, { tag: "watchlist" }, null)
        assert(tagged.items.some((i) => i.id === sharedCampaign.id), "entity tagged 'watchlist' should appear")

        const untagged = await getFeedPage(clientB.id, PLAN, { tag: "watchlist" }, null)
        assert(untagged.items.length === 0, "a client with no matching tags should see an empty feed")
      } finally {
        await prisma.entityTag.deleteMany({ where: { clientId: clientA.id, entityId: entity.id } })
        await prisma.user.delete({ where: { id: taggingUser.id } })
      }
    })

    // ── Search filters (email + sms) ───────────────────────────────────────────
    await test("search filter matches email subject/sender", async () => {
      const { items } = await getFeedPage(clientA.id, PLAN, { search: "Shared campaign" }, null)
      assert(items.some((i) => i.id === sharedCampaign.id), "search should match the campaign subject")
      const { items: noMatch } = await getFeedPage(clientA.id, PLAN, { search: "nonexistent-search-term-xyz" }, null)
      assert(noMatch.length === 0, "an unmatched search term should return nothing")
    })

    const smsCampaign = await prisma.smsQueue.create({
      data: {
        entityId: entity.id,
        rawData: "raw",
        processed: true,
        phoneNumber: "+15551234567",
        message: `${PREFIX}Please donate to the cause`,
      },
    })
    const unprocessedSms = await prisma.smsQueue.create({
      data: {
        entityId: entity.id,
        rawData: "raw",
        processed: false,
        phoneNumber: "+15557654321",
        message: `${PREFIX}Unprocessed message`,
      },
    })

    await test("search filter matches sms message content", async () => {
      const { items } = await getFeedPage(clientA.id, PLAN, { search: `${PREFIX}Please donate`, messageType: "sms" }, null)
      assert(items.some((i) => i.id === smsCampaign.id), "search should match the SMS message body")
    })

    await test("unprocessed SMS is excluded from the feed listing", async () => {
      const { items } = await getFeedPage(clientA.id, PLAN, { messageType: "sms" }, null)
      assert(!items.some((i) => i.id === unprocessedSms.id), "unprocessed SMS must not appear in the feed")
      assert(items.some((i) => i.id === smsCampaign.id), "processed SMS should still appear")
    })

    await test("getFeedItemById returns null for unprocessed SMS", async () => {
      const view = await getFeedItemById(clientA.id, PLAN, unprocessedSms.id, "sms")
      assert(view === null, "unprocessed SMS should not be viewable via detail either")
    })

    await test("getFeedItemById returns processed SMS detail", async () => {
      const view = await getFeedItemById(clientA.id, PLAN, smsCampaign.id, "sms")
      assert(view !== null, "processed SMS should be viewable")
    })

    // ── Retention / plan history bypass attempts ───────────────────────────────
    await test("Client.dataRetentionDays hides items older than the retention window even on an unlimited-history plan", async () => {
      const oldCampaign = await prisma.competitiveInsightCampaign.create({
        data: {
          entityId: entity.id,
          senderName: `${PREFIX}old_sender`,
          senderEmail: "old@example.com",
          subject: "Old campaign outside tight retention",
          dateReceived: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
          inboxRate: 100,
        },
      })
      try {
        const { items } = await getFeedPage(clientTightRetention.id, PLAN, {}, null)
        assert(
          !items.some((i) => i.id === oldCampaign.id),
          "an item older than the client's 1-day retention window must not appear, even on the 'all' plan",
        )
        const view = await getFeedItemById(clientTightRetention.id, PLAN, oldCampaign.id, "email")
        assert(view === null, "retention rules must also apply to direct detail-view access, not just listing")
      } finally {
        await prisma.competitiveInsightCampaign.delete({ where: { id: oldCampaign.id } })
      }
    })

    // ── Malformed cursor ────────────────────────────────────────────────────────
    await test("decodeCursor returns null when no cursor is supplied", async () => {
      assert(decodeCursor(null) === null, "no cursor should decode to null")
      assert(decodeCursor(undefined) === null, "no cursor should decode to null")
      assert(decodeCursor("") === null, "empty string cursor should decode to null")
    })

    await test("decodeCursor rejects a malformed cursor instead of silently ignoring it", async () => {
      await expectMobileError(() => decodeCursor("not-valid-base64url-json!!"), "INVALID_CURSOR")
      await expectMobileError(() => decodeCursor(Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url")), "INVALID_CURSOR")
    })

    // ── Cursor pagination: stable ordering across pages, no dupes/skips ────────
    await test("cursor pagination returns a distinct, complete second page", async () => {
      const bulkCount = 30
      const now = Date.now()
      const bulkCampaigns = await Promise.all(
        Array.from({ length: bulkCount }, (_, i) =>
          prisma.competitiveInsightCampaign.create({
            data: {
              entityId: entity.id,
              senderName: `${PREFIX}bulk_sender_${i}`,
              senderEmail: `bulk${i}@example.com`,
              subject: `Bulk campaign ${i}`,
              dateReceived: new Date(now - i * 1000), // strictly descending
              inboxRate: 100,
            },
          }),
        ),
      )
      try {
        const page1 = await getFeedPage(clientA.id, PLAN, {}, null)
        assert(page1.hasMore, "expected more than one page given >25 bulk items")
        assert(page1.nextCursor !== null, "expected a nextCursor on a full first page")

        const cursor = decodeCursor(page1.nextCursor)
        const page2 = await getFeedPage(clientA.id, PLAN, {}, cursor)

        const page1Ids = new Set(page1.items.map((i) => i.id))
        const overlap = page2.items.filter((i) => page1Ids.has(i.id))
        assert(overlap.length === 0, `page 2 must not repeat any page 1 item, found ${overlap.length} overlaps`)

        // All items across both pages should be in strictly non-increasing (dateReceived, id) order.
        const combined = [...page1.items, ...page2.items]
        for (let i = 1; i < combined.length; i++) {
          const prev = combined[i - 1]
          const cur = combined[i]
          assert(
            prev.dateReceived > cur.dateReceived || (prev.dateReceived === cur.dateReceived && prev.id >= cur.id),
            `ordering violated between item ${i - 1} and ${i}`,
          )
        }
      } finally {
        await prisma.competitiveInsightCampaign.deleteMany({ where: { id: { in: bulkCampaigns.map((c) => c.id) } } })
      }
    })
  } finally {
    await cleanup()
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

main()
  .catch((error) => {
    console.error("Test run crashed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanup()
    await prisma.$disconnect()
  })
