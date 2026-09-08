import assert from "node:assert/strict"
import test from "node:test"

import type { MobileAuthContext } from "@/lib/mobile-auth"
import { MobileAuthError } from "@/lib/mobile-auth"
import { requireClientContext, requireFeedSearchAndFilters, requireMobileAlerts } from "@/lib/services/authz"
import {
  assertMobileFeedFiltersAllowed,
  getFeedPage,
  hasActiveMobileFeedFilters,
  type FeedFilters,
} from "@/lib/services/feed-service"
import {
  getMobileClientEntitlements,
  type MobileClientEntitlements,
} from "@/lib/services/mobile-entitlements"
import type { SubscriptionPlan } from "@/lib/subscription-utils"

const EXPECTED_ENTITLEMENTS: Record<SubscriptionPlan, MobileClientEntitlements> = {
  free: {
    canSearchAndFilterFeed: false,
    canUseAlerts: false,
    feedHistoryHours: 3,
    followedEntityLimit: 0,
  },
  paid: {
    canSearchAndFilterFeed: true,
    canUseAlerts: true,
    feedHistoryHours: 72,
    followedEntityLimit: 3,
  },
  all: {
    canSearchAndFilterFeed: true,
    canUseAlerts: true,
    feedHistoryHours: null,
    followedEntityLimit: null,
  },
  basic_inboxing: {
    canSearchAndFilterFeed: true,
    canUseAlerts: true,
    feedHistoryHours: null,
    followedEntityLimit: null,
  },
  enterprise: {
    canSearchAndFilterFeed: true,
    canUseAlerts: true,
    feedHistoryHours: null,
    followedEntityLimit: null,
  },
}

function authContext(plan: string): MobileAuthContext {
  return {
    userId: "user-1",
    role: "client",
    clientId: "client-1",
    clientSlug: "client-1",
    firstLogin: false,
    client: {
      id: "client-1",
      slug: "client-1",
      active: true,
      subscriptionPlan: plan,
      subscriptionStatus: "active",
      hasCompetitiveInsights: true,
      entitlements: getMobileClientEntitlements(plan),
    },
  }
}

test("publishes the exact mobile entitlement matrix from the shared plan limits", () => {
  for (const [plan, expected] of Object.entries(EXPECTED_ENTITLEMENTS)) {
    assert.deepEqual(getMobileClientEntitlements(plan), expected)
  }
})

test("unknown plans fail closed to Starter entitlements", () => {
  assert.deepEqual(getMobileClientEntitlements("future-plan"), EXPECTED_ENTITLEMENTS.free)
  assert.throws(
    () => requireClientContext(authContext("future-plan")),
    (error: unknown) =>
      error instanceof MobileAuthError && error.code === "UNSUPPORTED_SUBSCRIPTION_PLAN",
  )
})

test("mobile alerts are paid-only and enforced by the API authorization layer", () => {
  assert.throws(
    () => requireMobileAlerts(authContext("free")),
    (error: unknown) =>
      error instanceof MobileAuthError &&
      error.status === 403 &&
      error.code === "ALERTS_NOT_AVAILABLE",
  )
  assert.deepEqual(requireMobileAlerts(authContext("paid")), { clientId: "client-1", plan: "paid" })
  assert.deepEqual(requireMobileAlerts(authContext("enterprise")), { clientId: "client-1", plan: "enterprise" })
})

test("detects every supported feed filter while ignoring empty filter state", () => {
  const activeFilters: FeedFilters[] = [
    { search: "fundraising" },
    { entityIds: ["entity-1"] },
    { party: "republican" },
    { state: "TX" },
    { entityType: "politician" },
    { messageType: "email" },
    { thirdParty: true },
    { houseFileOnly: true },
    { donationPlatform: "winred" },
    { fromDate: new Date("2026-09-01T00:00:00.000Z") },
    { toDate: new Date("2026-09-07T23:59:59.999Z") },
    { tag: "watchlist" },
    { subscriptionsOnly: true },
  ]

  for (const filters of activeFilters) assert.equal(hasActiveMobileFeedFilters(filters), true)
  assert.equal(hasActiveMobileFeedFilters({}), false)
  assert.equal(hasActiveMobileFeedFilters({ search: "  ", entityIds: [], thirdParty: false }), false)
})

test("Starter can paginate an unfiltered feed but cannot apply any filter", () => {
  assert.doesNotThrow(() => assertMobileFeedFiltersAllowed("free", {}))
  assert.doesNotThrow(() =>
    assertMobileFeedFiltersAllowed("free", { search: "  ", entityIds: [], subscriptionsOnly: false }),
  )

  const activeFilters: FeedFilters[] = [
    { search: "fundraising" },
    { entityIds: ["entity-1"] },
    { party: "republican" },
    { state: "TX" },
    { entityType: "politician" },
    { messageType: "sms" },
    { thirdParty: true },
    { houseFileOnly: true },
    { donationPlatform: "anedot" },
    { fromDate: new Date("2026-09-01T00:00:00.000Z") },
    { toDate: new Date("2026-09-07T23:59:59.999Z") },
    { tag: "watchlist" },
    { subscriptionsOnly: true },
  ]

  for (const filters of activeFilters) {
    assert.throws(
      () => assertMobileFeedFiltersAllowed("free", filters),
      (error: unknown) =>
        error instanceof MobileAuthError &&
        error.status === 403 &&
        error.code === "FEED_FILTERS_NOT_AVAILABLE",
    )
  }
})

test("paid plans retain search/filter access", () => {
  for (const plan of ["paid", "all", "basic_inboxing", "enterprise"] as const) {
    assert.doesNotThrow(() => assertMobileFeedFiltersAllowed(plan, { search: "fundraising", state: "TX" }))
    assert.equal(requireFeedSearchAndFilters(authContext(plan)).plan, plan)
  }
})

test("the filter-metadata authorization guard rejects Starter", () => {
  assert.throws(
    () => requireFeedSearchAndFilters(authContext("free")),
    (error: unknown) =>
      error instanceof MobileAuthError &&
      error.status === 403 &&
      error.code === "FEED_FILTERS_NOT_AVAILABLE",
  )
})

test("getFeedPage rejects a Starter filter before attempting database work", async () => {
  await assert.rejects(
    getFeedPage("not-a-real-client", "free", { search: "fundraising" }, null),
    (error: unknown) =>
      error instanceof MobileAuthError && error.code === "FEED_FILTERS_NOT_AVAILABLE",
  )
})
