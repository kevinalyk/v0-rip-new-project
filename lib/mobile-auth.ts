/**
 * Mobile API authentication (app/api/mobile/v1/*).
 *
 * Deliberately separate from lib/auth.ts (browser cookie session, JWT_SECRET) and
 * lib/api-auth.ts (developer API keys, ApiKey model). Nothing here reads or writes
 * the `auth_token` cookie, and nothing in the browser session path imports this file.
 *
 * Design points (see docs/mobile-api.md for the full write-up):
 * - Short-lived (15m) bearer access tokens signed with a dedicated MOBILE_JWT_SECRET.
 * - Access tokens carry only `sub`/`typ`/`iss`/`aud`/`iat`/`exp` — no role/clientId/PII —
 *   because withMobileAuth always reloads the user + client from Postgres before any
 *   authorization decision, so embedding claims would be redundant and risk stale use.
 * - Refresh tokens are opaque random values; only their SHA-256 hash is ever persisted.
 *   Rotation is atomic (conditional update inside a transaction) and reuse of an
 *   already-rotated/revoked token revokes the entire token family (replay defense).
 * - Rate limiting is Postgres-backed (MobileAuthAttempt) — no in-memory store, since
 *   this runs across many serverless instances — and only stores salted/HMAC'd keys.
 */

import { SignJWT, jwtVerify, errors as joseErrors } from "jose"
import { randomBytes, createHash, createHmac } from "crypto"
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"

const ISSUER = "inbox-gop-mobile"
const AUDIENCE = "inbox-gop-ios"
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60 // 15 minutes
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // each token's own sliding expiry
const REFRESH_SESSION_ABSOLUTE_TTL_MS = 30 * 24 * 60 * 60 * 1000 // hard cap on the whole family, from login
const RATE_LIMIT_WINDOW_MS = 60 * 1000 // 1 minute
const RATE_LIMIT_CLEANUP_SAMPLE_RATE = 0.05 // ~5% of rate-limited requests also sweep old rows
const RATE_LIMIT_RETENTION_MS = 60 * 60 * 1000 // rows older than 1h are eligible for cleanup

function getMobileJwtSecret(): Uint8Array {
  const secret = process.env.MOBILE_JWT_SECRET
  if (!secret) {
    // No fallback, ever — a missing secret must fail loudly rather than silently
    // signing/verifying mobile tokens with a guessable default.
    throw new Error(
      "MOBILE_JWT_SECRET is not set. The mobile API cannot issue or verify tokens without it.",
    )
  }
  return new TextEncoder().encode(secret)
}

export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const

export class MobileAuthError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export interface MobileTokenClaims {
  sub: string // userId
  typ: "access"
  iat: number
  exp: number
}

export interface MobileAuthContext {
  userId: string
  role: string
  clientId: string | null
  clientSlug: string | null
  firstLogin: boolean
  client: {
    id: string
    slug: string
    active: boolean
    subscriptionPlan: string
    subscriptionStatus: string
    hasCompetitiveInsights: boolean
  } | null
}

// ── Access tokens ──────────────────────────────────────────────────────────

export async function createMobileAccessToken(userId: string): Promise<{ token: string; expiresIn: number }> {
  const secretKey = getMobileJwtSecret()
  const token = await new SignJWT({ typ: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secretKey)
  return { token, expiresIn: ACCESS_TOKEN_TTL_SECONDS }
}

export async function verifyMobileAccessToken(token: string): Promise<MobileTokenClaims> {
  const secretKey = getMobileJwtSecret()
  try {
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: AUDIENCE,
    })
    if (payload.typ !== "access" || typeof payload.sub !== "string" || !payload.sub) {
      throw new MobileAuthError(401, "INVALID_TOKEN", "Invalid access token")
    }
    return payload as unknown as MobileTokenClaims
  } catch (error) {
    if (error instanceof MobileAuthError) throw error
    if (error instanceof joseErrors.JWTExpired) {
      throw new MobileAuthError(401, "TOKEN_EXPIRED", "Access token expired")
    }
    throw new MobileAuthError(401, "INVALID_TOKEN", "Invalid access token")
  }
}

/**
 * Extracts the bearer token, verifies it, reloads the user + client from Postgres
 * (never trusts stale claims), and returns a normalized context. Default is deny:
 * any failure throws MobileAuthError instead of returning a partial/optimistic context.
 */
export async function requireMobileAuth(request: Request): Promise<MobileAuthContext> {
  const authHeader = request.headers.get("authorization") || request.headers.get("Authorization")
  const match = authHeader?.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    throw new MobileAuthError(401, "MISSING_TOKEN", "Missing or malformed Authorization header")
  }

  const claims = await verifyMobileAccessToken(match[1])

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    include: {
      client: {
        select: {
          id: true,
          slug: true,
          active: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          hasCompetitiveInsights: true,
        },
      },
    },
  })

  if (!user) {
    throw new MobileAuthError(401, "USER_NOT_FOUND", "User no longer exists")
  }

  if (user.clientId && !user.client) {
    // Client record referenced by the user is missing — fail closed.
    throw new MobileAuthError(403, "CLIENT_NOT_FOUND", "Associated client no longer exists")
  }

  if (user.client && user.client.active === false) {
    throw new MobileAuthError(403, "CLIENT_INACTIVE", "Client account is inactive")
  }

  if (user.firstLogin) {
    // An administrator can force this at any time (e.g. a password reset), even mid-session —
    // requireMobileAuth reloads the user on every request, so this takes effect on the very
    // next authenticated call, not just at the next login/refresh.
    throw new MobileAuthError(
      403,
      "PASSWORD_RESET_REQUIRED",
      "This account must complete a password reset on the web app before continuing to use the mobile app.",
    )
  }

  return {
    userId: user.id,
    role: user.role,
    clientId: user.clientId,
    clientSlug: user.client?.slug ?? null,
    firstLogin: user.firstLogin,
    client: user.client
      ? {
          id: user.client.id,
          slug: user.client.slug,
          active: user.client.active,
          subscriptionPlan: user.client.subscriptionPlan,
          subscriptionStatus: user.client.subscriptionStatus,
          hasCompetitiveInsights: user.client.hasCompetitiveInsights,
        }
      : null,
  }
}

type MobileRouteHandler<T> = (request: Request, ctx: MobileAuthContext, extra: T) => Promise<Response>

/**
 * Route-handler wrapper for every protected /api/mobile/v1 route. Enforces bearer-token
 * auth with a freshly-loaded user before calling the handler. This is defense-in-depth on
 * top of the middleware.ts allow-list — a route that forgets to use this wrapper still
 * cannot be reached without a syntactically valid bearer header (middleware), and even
 * then it would 401 immediately since no context would be constructed.
 */
export function withMobileAuth<T = undefined>(handler: MobileRouteHandler<T>) {
  return async (request: Request, extra: T): Promise<Response> => {
    try {
      const ctx = await requireMobileAuth(request)
      return await handler(request, ctx, extra)
    } catch (error) {
      if (error instanceof MobileAuthError) {
        return mobileError(error.status, error.code, error.message)
      }
      console.error("[mobile-auth] Unexpected error in withMobileAuth:", error)
      return mobileError(500, "INTERNAL_ERROR", "Internal server error")
    }
  }
}

export function mobileError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS },
  })
}

export function mobileJson(data: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: { "Content-Type": "application/json", ...NO_STORE_HEADERS },
  })
}

// ── Refresh tokens ──────────────────────────────────────────────────────────

function generateRefreshToken(): string {
  return randomBytes(32).toString("base64url")
}

function hashRefreshToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex")
}

function generateTokenFamilyId(): string {
  return randomBytes(16).toString("hex")
}

export interface MobileSession {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/**
 * Issues a brand-new session (new token family) — used on login only.
 */
export async function issueMobileSession(
  userId: string,
  deviceId?: string | null,
  deviceName?: string | null,
): Promise<MobileSession> {
  const rawRefreshToken = generateRefreshToken()
  const tokenFamilyId = generateTokenFamilyId()
  const now = Date.now()

  await prisma.mobileRefreshToken.create({
    data: {
      userId,
      refreshTokenHash: hashRefreshToken(rawRefreshToken),
      tokenFamilyId,
      deviceId: deviceId || null,
      deviceName: deviceName || null,
      expiresAt: new Date(now + REFRESH_TOKEN_TTL_MS),
      // Fixed at family creation — every descendant token from rotation copies this
      // value unchanged, so the family can never live longer than 30 days from login.
      absoluteExpiresAt: new Date(now + REFRESH_SESSION_ABSOLUTE_TTL_MS),
    },
  })

  const { token: accessToken, expiresIn } = await createMobileAccessToken(userId)
  return { accessToken, refreshToken: rawRefreshToken, expiresIn }
}

/**
 * Atomically rotates a refresh token. Two concurrent calls with the same raw token
 * race on a conditional `updateMany` (`where: revokedAt: null`) inside a transaction;
 * only the caller whose update affects exactly one row proceeds to mint the next token.
 * The loser gets a generic invalid-token error and never gets a new token issued.
 *
 * Reuse of an already-revoked token (a replayed/stolen refresh token) revokes the whole
 * `tokenFamilyId` immediately.
 */
export async function rotateMobileSession(rawRefreshToken: string): Promise<MobileSession> {
  const refreshTokenHash = hashRefreshToken(rawRefreshToken)

  const existing = await prisma.mobileRefreshToken.findUnique({ where: { refreshTokenHash } })
  if (!existing) {
    throw new MobileAuthError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }

  if (existing.revokedAt) {
    // Replay of a token that was already rotated, logged out, or previously flagged —
    // treat the entire family as compromised.
    await revokeMobileFamily(existing.tokenFamilyId, "replay_detected")
    throw new MobileAuthError(401, "REFRESH_TOKEN_REUSED", "Invalid refresh token")
  }

  if (existing.expiresAt < new Date()) {
    throw new MobileAuthError(401, "REFRESH_TOKEN_EXPIRED", "Refresh token expired")
  }

  if (existing.absoluteExpiresAt < new Date()) {
    // The family has reached its 30-day hard cap from login — no amount of rotation
    // can extend it. The caller must sign in again.
    throw new MobileAuthError(401, "REFRESH_TOKEN_EXPIRED", "Session has reached its maximum lifetime")
  }

  // Enforce administrator-forced password resets on refresh, not just on new logins —
  // otherwise a device that already has a refresh token could keep itself signed in
  // indefinitely by refreshing instead of ever hitting the login/firstLogin check again.
  const user = await prisma.user.findUnique({ where: { id: existing.userId }, select: { firstLogin: true } })
  if (!user) {
    await revokeMobileFamily(existing.tokenFamilyId, "replay_detected")
    throw new MobileAuthError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }
  if (user.firstLogin) {
    await revokeMobileFamily(existing.tokenFamilyId, "password_reset_required")
    throw new MobileAuthError(
      403,
      "PASSWORD_RESET_REQUIRED",
      "This account must complete a password reset on the web app before continuing to use the mobile app.",
    )
  }

  const rawNextRefreshToken = generateRefreshToken()
  // Sliding per-token expiry, but never past the family's fixed absolute cap.
  const nextExpiresAt = new Date(Math.min(Date.now() + REFRESH_TOKEN_TTL_MS, existing.absoluteExpiresAt.getTime()))

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const revoked = await tx.mobileRefreshToken.updateMany({
      where: { id: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: "rotated", lastUsedAt: new Date() },
    })

    if (revoked.count !== 1) {
      // Lost the race to another concurrent refresh (or a replay check) — do not issue
      // a new token.
      return null
    }

    await tx.mobileRefreshToken.create({
      data: {
        userId: existing.userId,
        refreshTokenHash: hashRefreshToken(rawNextRefreshToken),
        tokenFamilyId: existing.tokenFamilyId,
        deviceId: existing.deviceId,
        deviceName: existing.deviceName,
        expiresAt: nextExpiresAt,
        // Copied unchanged from the token being rotated — never extended.
        absoluteExpiresAt: existing.absoluteExpiresAt,
      },
    })

    return true
  })

  if (!result) {
    throw new MobileAuthError(401, "INVALID_REFRESH_TOKEN", "Invalid refresh token")
  }

  const { token: accessToken, expiresIn } = await createMobileAccessToken(existing.userId)
  return { accessToken, refreshToken: rawNextRefreshToken, expiresIn }
}

/** Logout: revokes exactly the session tied to the given raw refresh token. Idempotent. */
export async function revokeMobileSession(rawRefreshToken: string): Promise<void> {
  const refreshTokenHash = hashRefreshToken(rawRefreshToken)
  await prisma.mobileRefreshToken.updateMany({
    where: { refreshTokenHash, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: "logout" },
  })
}

export async function revokeMobileFamily(
  tokenFamilyId: string,
  reason: "replay_detected" | "logout" | "password_reset_required",
): Promise<void> {
  await prisma.mobileRefreshToken.updateMany({
    where: { tokenFamilyId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  })
}

// ── Rate limiting (Postgres-backed; no in-memory state) ────────────────────

function hmacKey(scope: string, value: string): string {
  // Keyed by MOBILE_JWT_SECRET so the stored `key` is not just a plain SHA-256 of a
  // guessable identifier (IP/email) — it requires the server secret to reproduce.
  const secret = process.env.MOBILE_JWT_SECRET || ""
  return createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex")
}

export function rateLimitKeyForIp(ip: string): string {
  return hmacKey("ip", ip)
}

export function rateLimitKeyForEmail(email: string): string {
  return hmacKey("email", email.trim().toLowerCase())
}

/**
 * Fixed-window limiter backed by MobileAuthAttempt. Returns true if the request is
 * allowed. Never stores the raw identifier — only its HMAC. Occasionally sweeps old
 * rows so the table cannot grow unbounded without needing a cron job.
 */
export async function checkMobileRateLimit(key: string, limit: number): Promise<boolean> {
  const windowStart = new Date(Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS)

  const row = await prisma.mobileAuthAttempt.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  })

  if (Math.random() < RATE_LIMIT_CLEANUP_SAMPLE_RATE) {
    prisma.mobileAuthAttempt
      .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - RATE_LIMIT_RETENTION_MS) } } })
      .catch((err: unknown) => console.error("[mobile-auth] rate limit cleanup failed:", err))
  }

  return row.count <= limit
}
