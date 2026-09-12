import assert from "node:assert/strict"
import test from "node:test"

import { normalizeMobileSavedView } from "@/lib/services/mobile-saved-view-service"

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
