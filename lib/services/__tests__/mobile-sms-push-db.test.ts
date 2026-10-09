/**
 * DB-backed concurrency test. Run only against an isolated dev/test database after
 * applying the SMS push claim migration. Never run against production.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import test from "node:test"

import prisma from "@/lib/prisma"
import { assertRealDatabaseOrExit } from "@/lib/services/__tests__/test-db-preflight"
import {
  claimSmsPushAndCreateDelivery,
  releaseFailedSmsPushClaim,
  smsPushFingerprint,
} from "@/lib/services/mobile-sms-push-dedupe"

test("SMS push claims are atomic, user-scoped, expire, and release after failure", async () => {
  await assertRealDatabaseOrExit()
  const suffix = randomUUID()
  const emailPrefix = `MOBILE_SMS_PUSH_TEST_${suffix}_`
  const fingerprint = smsPushFingerprint({ entityId: "test-entity", preview: "Same campaign text" })
  const otherFingerprint = smsPushFingerprint({ entityId: "test-entity", preview: "Different campaign text" })
  const claim = (userId: string, sourceId: string, key = fingerprint) =>
    claimSmsPushAndCreateDelivery({ userId, sourceId, fingerprint: key, matchedAlertIds: [] })

  try {
    const [firstUser, secondUser] = await Promise.all([1, 2].map((n) => prisma.user.create({
      data: { email: `${emailPrefix}${n}@example.test`, password: "not-a-login-account" },
      select: { id: true },
    })))
    const sameBlast = await Promise.all([
      claim(firstUser.id, `${suffix}-phone-1`),
      claim(firstUser.id, `${suffix}-phone-2`),
    ])
    assert.equal(sameBlast.filter(Boolean).length, 1, "concurrent phones produce one delivery")
    assert.equal(await prisma.mobileAlertDelivery.count({ where: { userId: firstUser.id, sourceType: "sms" } }), 1)
    // Simulate the second receiving phone arriving three minutes later.
    await prisma.mobileSmsPushClaim.update({
      where: { userId_fingerprint: { userId: firstUser.id, fingerprint } },
      data: { expiresAt: new Date(Date.now() + 12 * 60_000) },
    })
    assert.equal(await claim(firstUser.id, `${suffix}-phone-3`), null)
    assert.ok(await claim(secondUser.id, `${suffix}-other-user`), "another user has an independent claim")
    assert.ok(await claim(firstUser.id, `${suffix}-different-text`, otherFingerprint))
    const otherEntityFingerprint = smsPushFingerprint({ entityId: "test-other-entity", preview: "Same campaign text" })
    assert.ok(await claim(firstUser.id, `${suffix}-other-entity`, otherEntityFingerprint))

    await prisma.mobileSmsPushClaim.update({
      where: { userId_fingerprint: { userId: firstUser.id, fingerprint } },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    })
    const afterWindow = await claim(firstUser.id, `${suffix}-after-window`)
    assert.ok(afterWindow, "the next send after expiry is allowed")

    const retryFingerprint = smsPushFingerprint({ entityId: "test-entity", preview: "Retry after Expo failure" })
    assert.ok(await claim(firstUser.id, `${suffix}-failed-send`, retryFingerprint))
    await releaseFailedSmsPushClaim({
      userId: firstUser.id,
      sourceId: `${suffix}-not-the-owner`,
      fingerprint: retryFingerprint,
    })
    assert.equal(await claim(firstUser.id, `${suffix}-still-suppressed`, retryFingerprint), null)
    await releaseFailedSmsPushClaim({
      userId: firstUser.id,
      sourceId: `${suffix}-failed-send`,
      fingerprint: retryFingerprint,
    })
    assert.ok(await claim(firstUser.id, `${suffix}-retry`, retryFingerprint))
  } finally {
    await prisma.user.deleteMany({ where: { email: { startsWith: emailPrefix } } })
  }
})
