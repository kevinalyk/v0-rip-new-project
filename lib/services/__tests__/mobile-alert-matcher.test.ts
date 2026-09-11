import assert from "node:assert/strict"
import test from "node:test"

import {
  candidateIsVisibleToClient,
  matchesMobileAlert,
  type MobileAlertCandidate,
} from "@/lib/services/mobile-alert-delivery-service"

const candidate: MobileAlertCandidate = {
  id: "message-1",
  type: "email",
  senderName: "Ann Wagner for Congress",
  subject: "A new Missouri update",
  preview: "Support our campaign today",
  entityId: "entity-1",
  entityName: "Ann Wagner",
  entityParty: "republican",
  entityState: "MO",
  entityType: "politician",
  isThirdParty: false,
  donationPlatform: "winred",
  sourceClientId: null,
}

const emptyAlert = {
  search: null,
  entityIds: [] as string[],
  party: null,
  state: null,
  entityType: null,
  messageTypes: [] as string[],
  ownershipTypes: [] as string[],
  donationPlatform: null,
  subscriptionsOnly: false,
  tag: null,
}

test("an alert with no filters matches every eligible CI message", () => {
  assert.equal(matchesMobileAlert(emptyAlert, candidate, false, new Set()), true)
})

test("combines criteria with AND semantics", () => {
  assert.equal(matchesMobileAlert({
    ...emptyAlert,
    search: "missouri",
    entityIds: ["entity-1"],
    party: "republican",
    state: "MO",
    entityType: "politician",
    messageTypes: ["email"],
    ownershipTypes: ["house_file"],
    donationPlatform: "winred",
    subscriptionsOnly: true,
    tag: "priority",
  }, candidate, true, new Set(["priority"])), true)

  assert.equal(matchesMobileAlert({ ...emptyAlert, state: "TX" }, candidate, false, new Set()), false)
  assert.equal(matchesMobileAlert({ ...emptyAlert, messageTypes: ["sms"] }, candidate, false, new Set()), false)
  assert.equal(matchesMobileAlert({ ...emptyAlert, ownershipTypes: ["third_party"] }, candidate, false, new Set()), false)
  assert.equal(matchesMobileAlert({ ...emptyAlert, subscriptionsOnly: true }, candidate, false, new Set()), false)
  assert.equal(matchesMobileAlert({ ...emptyAlert, tag: "priority" }, candidate, false, new Set()), false)
})

test("normalizes Independent party aliases and performs case-insensitive matching", () => {
  const independent = { ...candidate, entityParty: "ind" }
  assert.equal(matchesMobileAlert({ ...emptyAlert, party: "Independent" }, independent, false, new Set()), true)
  assert.equal(matchesMobileAlert({ ...emptyAlert, search: "WAGNER" }, candidate, false, new Set()), true)
})

test("classifies null ownership as house file to preserve legacy feed behavior", () => {
  const legacy = { ...candidate, isThirdParty: null }
  assert.equal(matchesMobileAlert({ ...emptyAlert, ownershipTypes: ["house_file"] }, legacy, false, new Set()), true)
})

test("shared messages are visible to followers while private captures stay client-scoped", () => {
  assert.equal(candidateIsVisibleToClient(candidate, "client-a"), true)

  const privateCandidate = { ...candidate, sourceClientId: "client-a" }
  assert.equal(candidateIsVisibleToClient(privateCandidate, "client-a"), true)
  assert.equal(candidateIsVisibleToClient(privateCandidate, "client-b"), false)
})
