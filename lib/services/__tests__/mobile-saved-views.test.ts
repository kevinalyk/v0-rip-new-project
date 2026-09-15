import assert from "node:assert/strict"
import test from "node:test"

import { MobileAuthError } from "@/lib/mobile-auth"
import {
  mobileFiltersToWebSettings,
  normalizeMobileSavedView,
  validateMobileSavedViewInput,
} from "@/lib/services/mobile-saved-view-service"

test("normalizes the current web saved-view shape for mobile", () => {
  const result = normalizeMobileSavedView({
    activeSearchQuery: "  fundraising  ",
    searchTerm: "ignored fallback",
    selectedSender: ["Ann Wagner", "Ann Wagner", "NRSC"],
    selectedPartyFilter: "republican",
    selectedStateFilter: "MO",
    selectedEntityTypeFilter: "candidate",
    selectedMessageType: "email",
    selectedMessageFilters: ["third_party", "invalid"],
    selectedDonationPlatform: "winred",
    showThirdParty: true,
    showHouseFileOnly: true,
    dateRange: { from: "2026-09-01T12:00:00.000Z", to: "2026-09-11T12:00:00.000Z" },
    subscriptionsOnly: true,
  })

  assert.deepEqual(result, {
    entityNames: ["Ann Wagner", "NRSC"],
    filters: {
      search: "fundraising",
      party: "republican",
      state: "MO",
      entityType: "candidate",
      messageFilters: ["third_party", "email", "house_file"],
      donationPlatform: "winred",
      fromDate: "2026-09-01",
      toDate: "2026-09-11",
      subscriptionsOnly: true,
    },
  })
})

test("supports legacy sender strings and fails closed on malformed settings", () => {
  assert.deepEqual(normalizeMobileSavedView({ selectedSender: "Ann Wagner", selectedPartyFilter: "all" }), {
    entityNames: ["Ann Wagner"],
    filters: {},
  })
  assert.deepEqual(normalizeMobileSavedView(null), { entityNames: [], filters: {} })
  assert.deepEqual(
    normalizeMobileSavedView({
      selectedDonationPlatform: "not-a-platform",
      dateRange: { from: "not-a-date" },
      selectedMessageFilters: [1, null, "not-a-filter"],
    }),
    { entityNames: [], filters: {} },
  )
})

test("validates and deduplicates a mobile saved-view request", () => {
  assert.deepEqual(
    validateMobileSavedViewInput({
      name: "  Missouri fundraising  ",
      filters: {
        search: "  donate  ",
        entityIds: ["entity-1", "entity-1", "entity-2"],
        party: "republican",
        state: "MO",
        entityType: "politician",
        messageFilters: ["email", "email", "third_party"],
        donationPlatform: "winred",
        fromDate: "2026-09-01",
        toDate: "2026-09-11",
        subscriptionsOnly: true,
      },
    }),
    {
      name: "Missouri fundraising",
      filters: {
        search: "donate",
        entityIds: ["entity-1", "entity-2"],
        party: "republican",
        state: "MO",
        entityType: "politician",
        messageFilters: ["email", "third_party"],
        donationPlatform: "winred",
        fromDate: "2026-09-01",
        toDate: "2026-09-11",
        subscriptionsOnly: true,
      },
    },
  )
})

test("rejects malformed, unsupported, and reversed saved-view filters", () => {
  const invalid = [
    { name: "", filters: {} },
    { name: "View", filters: { party: "not-a-party" } },
    { name: "View", filters: { state: "ZZ" } },
    { name: "View", filters: { entityType: "data_broker" } },
    { name: "View", filters: { messageFilters: ["fax"] } },
    { name: "View", filters: { fromDate: "2026-09-12", toDate: "2026-09-11" } },
  ]

  for (const value of invalid) {
    assert.throws(
      () => validateMobileSavedViewInput(value),
      (error) => error instanceof MobileAuthError && error.status === 400 && error.code === "INVALID_BODY",
    )
  }
})

test("converts mobile filters into the web-compatible saved-view shape", () => {
  const settings = mobileFiltersToWebSettings(
    {
      search: "fundraising",
      entityIds: ["entity-1"],
      party: "republican",
      state: "MO",
      entityType: "politician",
      messageFilters: ["email", "third_party"],
      donationPlatform: "winred",
      fromDate: "2026-09-01",
      toDate: "2026-09-11",
      subscriptionsOnly: true,
    },
    ["Ann Wagner"],
  )

  assert.deepEqual(settings, {
    activeSearchQuery: "fundraising",
    searchTerm: "fundraising",
    selectedSender: ["Ann Wagner"],
    mobileEntityIds: ["entity-1"],
    selectedPartyFilter: "republican",
    selectedStateFilter: "MO",
    selectedEntityTypeFilter: "politician",
    selectedMessageType: "email",
    selectedMessageFilters: ["email", "third_party"],
    selectedDonationPlatform: "winred",
    showThirdParty: true,
    showHouseFileOnly: false,
    dateRange: { from: "2026-09-01", to: "2026-09-11" },
    subscriptionsOnly: true,
  })
})

test("preserves canonical mobile entity IDs while keeping legacy sender names", () => {
  assert.deepEqual(
    normalizeMobileSavedView({
      selectedSender: ["Same Name"],
      mobileEntityIds: ["entity-a", "entity-a", "entity-b"],
    }),
    {
      entityNames: ["Same Name"],
      filters: { entityIds: ["entity-a", "entity-b"] },
    },
  )
})
