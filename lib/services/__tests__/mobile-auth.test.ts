/**
 * Integration test matrix for lib/mobile-auth.ts, covering the acceptance criteria in
 * v0_plans/prime-route.md. This is a lightweight tsx-run script (no test framework is
 * configured in this project) rather than a Jest/Vitest suite.
 *
 * IMPORTANT: this hits whatever database DATABASE_URL points to. It creates its own
 * Client/User fixtures (id-prefixed with MOBILE_TEST_) and deletes everything it
 * created — including any leftovers from a previous crashed run — in a finally block.
 * Do not point DATABASE_URL at a production database when running this.
 *
 * Run with: npx tsx lib/services/__tests__/mobile-auth.test.ts
 * (loads .env.development.local itself; see bottom of file)
 */
import { config as loadEnv } from "dotenv"
loadEnv({ path: ".env.development.local" })

import { SignJWT } from "jose"
import { createHash } from "crypto"
import prisma from "@/lib/prisma"
import {
  createMobileAccessToken,
  verifyMobileAccessToken,
  requireMobileAuth,
  issueMobileSession,
  rotateMobileSession,
  revokeMobileSession,
  checkMobileRateLimit,
  rateLimitKeyForIp,
  MobileAuthError,
} from "@/lib/mobile-auth"
import { getFeedItemById } from "@/lib/services/feed-service"

const PREFIX = "MOBILE_TEST_"
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

async function expectMobileError(fn: () => Promise<unknown>, expectedCode: string) {
  try {
    await fn()
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
  await prisma.mobileRefreshToken.deleteMany({ where: { user: { email: { startsWith: PREFIX } } } })
  await prisma.mobileAuthAttempt.deleteMany({ where: { key: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  await prisma.client.deleteMany({ where: { id: { startsWith: PREFIX } } })
}

async function main() {
  await cleanup() // clear any leftovers from a previously interrupted run

  const clientA = await prisma.client.create({
    data: { id: `${PREFIX}client_a`, name: `${PREFIX}Client A`, slug: `${PREFIX.toLowerCase()}client-a`, active: true },
  })
  const clientBInactive = await prisma.client.create({
    data: {
      id: `${PREFIX}client_b_inactive`,
      name: `${PREFIX}Client B Inactive`,
      slug: `${PREFIX.toLowerCase()}client-b`,
      active: false,
    },
  })

  const userA = await prisma.user.create({
    data: { email: `${PREFIX}user_a@example.com`, password: "hashed", clientId: clientA.id, firstLogin: false },
  })
  const userInactiveClient = await prisma.user.create({
    data: { email: `${PREFIX}user_inactive@example.com`, password: "hashed", clientId: clientBInactive.id, firstLogin: false },
  })
  const userForcedReset = await prisma.user.create({
    data: { email: `${PREFIX}user_forced_reset@example.com`, password: "hashed", clientId: clientA.id, firstLogin: false },
  })

  // ── Access token issuance + verification ──────────────────────────────────
  await test("createMobileAccessToken + verifyMobileAccessToken round-trip", async () => {
    const { token, expiresIn } = await createMobileAccessToken(userA.id)
    assert(expiresIn === 15 * 60, "access token TTL should be 15 minutes")
    const claims = await verifyMobileAccessToken(token)
    assert(claims.sub === userA.id, "subject should match")
    assert(claims.typ === "access", "typ should be access")
  })

  // ── Missing / malformed Authorization header ──────────────────────────────
  await test("requireMobileAuth rejects missing Authorization header", async () => {
    await expectMobileError(() => requireMobileAuth(new Request("http://x", {})), "MISSING_TOKEN")
  })
  await test("requireMobileAuth rejects malformed Authorization header", async () => {
    await expectMobileError(
      () => requireMobileAuth(new Request("http://x", { headers: { Authorization: "Basic abc123" } })),
      "MISSING_TOKEN",
    )
  })

  // ── Wrong issuer / audience / typ / secret ────────────────────────────────
  await test("verifyMobileAccessToken rejects wrong issuer", async () => {
    const secretKey = new TextEncoder().encode(process.env.MOBILE_JWT_SECRET!)
    const badToken = await new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("wrong-issuer")
      .setAudience("inbox-gop-ios")
      .setSubject(userA.id)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secretKey)
    await expectMobileError(() => verifyMobileAccessToken(badToken), "INVALID_TOKEN")
  })
  await test("verifyMobileAccessToken rejects wrong audience", async () => {
    const secretKey = new TextEncoder().encode(process.env.MOBILE_JWT_SECRET!)
    const badToken = await new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("inbox-gop-mobile")
      .setAudience("wrong-audience")
      .setSubject(userA.id)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secretKey)
    await expectMobileError(() => verifyMobileAccessToken(badToken), "INVALID_TOKEN")
  })
  await test("verifyMobileAccessToken rejects wrong typ claim", async () => {
    const secretKey = new TextEncoder().encode(process.env.MOBILE_JWT_SECRET!)
    const badToken = await new SignJWT({ typ: "refresh" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("inbox-gop-mobile")
      .setAudience("inbox-gop-ios")
      .setSubject(userA.id)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(secretKey)
    await expectMobileError(() => verifyMobileAccessToken(badToken), "INVALID_TOKEN")
  })
  await test("verifyMobileAccessToken rejects token signed with wrong secret", async () => {
    const wrongSecretKey = new TextEncoder().encode("definitely-not-the-real-secret")
    const badToken = await new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("inbox-gop-mobile")
      .setAudience("inbox-gop-ios")
      .setSubject(userA.id)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(wrongSecretKey)
    await expectMobileError(() => verifyMobileAccessToken(badToken), "INVALID_TOKEN")
  })

  // ── Expired access token ───────────────────────────────────────────────────
  await test("verifyMobileAccessToken rejects expired access token", async () => {
    const secretKey = new TextEncoder().encode(process.env.MOBILE_JWT_SECRET!)
    const expiredToken = await new SignJWT({ typ: "access" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("inbox-gop-mobile")
      .setAudience("inbox-gop-ios")
      .setSubject(userA.id)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(secretKey)
    await expectMobileError(() => verifyMobileAccessToken(expiredToken), "TOKEN_EXPIRED")
  })

  // ── requireMobileAuth reloads from Postgres / inactive & missing user/client ─
  await test("requireMobileAuth rejects token for a deleted user", async () => {
    const { token } = await createMobileAccessToken("nonexistent-user-id")
    await expectMobileError(() => requireMobileAuth(new Request("http://x", { headers: { Authorization: `Bearer ${token}` } })), "USER_NOT_FOUND")
  })
  await test("requireMobileAuth rejects a user whose client is inactive", async () => {
    const { token } = await createMobileAccessToken(userInactiveClient.id)
    await expectMobileError(() => requireMobileAuth(new Request("http://x", { headers: { Authorization: `Bearer ${token}` } })), "CLIENT_INACTIVE")
  })
  await test("requireMobileAuth succeeds and reloads current role/client for a valid user", async () => {
    const { token } = await createMobileAccessToken(userA.id)
    const ctx = await requireMobileAuth(new Request("http://x", { headers: { Authorization: `Bearer ${token}` } }))
    assert(ctx.userId === userA.id, "userId should match")
    assert(ctx.clientId === clientA.id, "clientId should be reloaded from Postgres")
  })

  // ── Refresh rotation, replay, concurrency, logout ─────────────────────────
  await test("issueMobileSession + rotateMobileSession rotates to a new refresh token", async () => {
    const session = await issueMobileSession(userA.id)
    const rotated = await rotateMobileSession(session.refreshToken)
    assert(rotated.refreshToken !== session.refreshToken, "rotation should produce a new refresh token")
  })

  await test("refresh-token replay revokes the entire token family", async () => {
    const session = await issueMobileSession(userA.id)
    const rotated = await rotateMobileSession(session.refreshToken)
    // Replaying the original (already-rotated) token should fail and burn the family...
    await expectMobileError(() => rotateMobileSession(session.refreshToken), "REFRESH_TOKEN_REUSED")
    // ...which means even the legitimately-rotated descendant token is now unusable: the whole
    // family (including this token) was marked revoked, so it also reads as a replay, not a
    // plain "not found" — this is the correct, more specific signal for family revocation.
    await expectMobileError(() => rotateMobileSession(rotated.refreshToken), "REFRESH_TOKEN_REUSED")
  })

  await test("concurrent refresh attempts on the same token: exactly one wins", async () => {
    const session = await issueMobileSession(userA.id)
    const results = await Promise.allSettled([
      rotateMobileSession(session.refreshToken),
      rotateMobileSession(session.refreshToken),
    ])
    const fulfilled = results.filter((r) => r.status === "fulfilled")
    const rejected = results.filter((r) => r.status === "rejected")
    assert(fulfilled.length === 1, `expected exactly 1 winner, got ${fulfilled.length}`)
    assert(rejected.length === 1, `expected exactly 1 loser, got ${rejected.length}`)
  })

  await test("expired refresh token is rejected", async () => {
    const session = await issueMobileSession(userA.id)
    await prisma.mobileRefreshToken.updateMany({
      where: { userId: userA.id, revokedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    await expectMobileError(() => rotateMobileSession(session.refreshToken), "REFRESH_TOKEN_EXPIRED")
  })

  // ── Administrator-forced password reset (firstLogin) ─────────────────────
  await test("requireMobileAuth blocks a session whose account was flipped to firstLogin mid-session", async () => {
    const { token } = await createMobileAccessToken(userForcedReset.id)
    // Sanity check: works before the forced reset.
    await requireMobileAuth(new Request("http://x", { headers: { Authorization: `Bearer ${token}` } }))
    await prisma.user.update({ where: { id: userForcedReset.id }, data: { firstLogin: true } })
    await expectMobileError(
      () => requireMobileAuth(new Request("http://x", { headers: { Authorization: `Bearer ${token}` } })),
      "PASSWORD_RESET_REQUIRED",
    )
    await prisma.user.update({ where: { id: userForcedReset.id }, data: { firstLogin: false } })
  })

  await test("rotateMobileSession blocks and revokes the family once firstLogin is forced", async () => {
    const session = await issueMobileSession(userForcedReset.id)
    await prisma.user.update({ where: { id: userForcedReset.id }, data: { firstLogin: true } })
    await expectMobileError(() => rotateMobileSession(session.refreshToken), "PASSWORD_RESET_REQUIRED")
    // The family should now be revoked entirely — even after the flag is cleared, this
    // same refresh token must not come back to life.
    await prisma.user.update({ where: { id: userForcedReset.id }, data: { firstLogin: false } })
    await expectMobileError(() => rotateMobileSession(session.refreshToken), "REFRESH_TOKEN_REUSED")
  })

  // ── Absolute (non-extendable) refresh-session expiry ──────────────────────
  await test("rotation cannot extend a refresh session past its absolute 30-day expiry", async () => {
    const session = await issueMobileSession(userA.id)
    // Simulate the family having been created 29 days ago, one day short of its cap.
    const almostExpired = new Date(Date.now() + 24 * 60 * 60 * 1000) // 1 day from now
    await prisma.mobileRefreshToken.updateMany({
      where: { userId: userA.id, revokedAt: null },
      data: { absoluteExpiresAt: almostExpired },
    })
    const rotated = await rotateMobileSession(session.refreshToken)
    const updated = await prisma.mobileRefreshToken.findUnique({
      where: { refreshTokenHash: createHash("sha256").update(rotated.refreshToken).digest("hex") },
    })
    assert(updated !== null, "rotated token should exist")
    assert(
      updated!.expiresAt.getTime() <= almostExpired.getTime(),
      "rotated token's sliding expiry must not exceed the family's absolute cap",
    )
    assert(
      updated!.absoluteExpiresAt.getTime() === almostExpired.getTime(),
      "absoluteExpiresAt must be copied unchanged by rotation",
    )
  })

  await test("rotateMobileSession rejects a session past its absolute 30-day expiry", async () => {
    const session = await issueMobileSession(userA.id)
    await prisma.mobileRefreshToken.updateMany({
      where: { userId: userA.id, revokedAt: null },
      data: { absoluteExpiresAt: new Date(Date.now() - 1000) },
    })
    await expectMobileError(() => rotateMobileSession(session.refreshToken), "REFRESH_TOKEN_EXPIRED")
  })

  await test("logout revokes the session and is idempotent", async () => {
    const session = await issueMobileSession(userA.id)
    await revokeMobileSession(session.refreshToken)
    await revokeMobileSession(session.refreshToken) // second call must not throw
    await expectMobileError(() => rotateMobileSession(session.refreshToken), "REFRESH_TOKEN_REUSED")
  })

  // ── Rate limiting ──────────────────────────────────────────────────────────
  await test("checkMobileRateLimit allows up to the limit then blocks", async () => {
    const key = rateLimitKeyForIp(`${PREFIX}198.51.100.7`)
    const results: boolean[] = []
    for (let i = 0; i < 6; i++) {
      results.push(await checkMobileRateLimit(key, 5))
    }
    assert(results.slice(0, 5).every(Boolean), "first 5 attempts should be allowed")
    assert(results[5] === false, "6th attempt should be blocked")
  })

  // ── Cross-client authorization (query-level enforcement) ─────────────────
  await test("a feed item scoped to one client is not accessible to another client", async () => {
    const campaign = await prisma.competitiveInsightCampaign.create({
      data: {
        clientId: clientA.id,
        senderName: `${PREFIX}sender`,
        senderEmail: `${PREFIX}sender@example.com`,
        subject: `${PREFIX}subject`,
        dateReceived: new Date(),
        inboxRate: 100,
      },
    })
    try {
      const visibleToOwner = await getFeedItemById(clientA.id, "enterprise", campaign.id, "email")
      assert(visibleToOwner !== null, "owning client should see its own item")

      const visibleToOtherClient = await getFeedItemById(clientBInactive.id, "enterprise", campaign.id, "email")
      assert(visibleToOtherClient === null, "a different client must not see another client's item")
    } finally {
      await prisma.competitiveInsightCampaign.delete({ where: { id: campaign.id } })
    }
  })

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
