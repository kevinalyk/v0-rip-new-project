import assert from "node:assert/strict"
import test from "node:test"

import { smsPushFingerprint } from "@/lib/services/mobile-sms-push-dedupe"

const base = {
  entityId: "entity-a",
  preview: "Please support us today. [Omitted Link]",
}

test("the same SMS on different seed phones has one fingerprint", () => {
  const firstPhone = { ...base, senderName: "6125550101", toNumber: "6125550111" }
  const secondPhone = { ...base, senderName: "6125550202", toNumber: "6125550222" }
  assert.equal(smsPushFingerprint(firstPhone), smsPushFingerprint(secondPhone))
})

test("harmless Unicode, case and whitespace differences do not trigger another push", () => {
  assert.equal(
    smsPushFingerprint(base),
    smsPushFingerprint({ ...base, preview: "  PLEASE support us today.\n\u00a0[Omitted Link]  " }),
  )
})

test("different message content or entity keeps its own notification", () => {
  assert.notEqual(smsPushFingerprint(base), smsPushFingerprint({ ...base, preview: "Another update" }))
  assert.notEqual(smsPushFingerprint(base), smsPushFingerprint({ ...base, entityId: "entity-b" }))
})

test("private and shared copies of the same SMS coalesce for the same user", () => {
  const privateCopy = { ...base, sourceClientId: "client-a" }
  assert.equal(smsPushFingerprint(base), smsPushFingerprint(privateCopy))
})
