# Mobile API (`/api/mobile/v1`)

A versioned, bearer-token-authenticated API namespace for a future native/Expo mobile
client. Entirely separate from:

- The browser cookie session (`lib/auth.ts`, `JWT_SECRET`) used by the Next.js web app.
- The developer API-key namespace (`lib/api-auth.ts`, `ApiKey` model, `/api/v1/*`).

Nothing in either of those was modified.

## Auth model

- **Access token**: short-lived JWT (15 min), HS256, signed with `MOBILE_JWT_SECRET`
  (required env var, no fallback — `lib/mobile-auth.ts` throws as soon as it's needed
  if unset). Claims: `sub` (userId), `typ: "access"`, `pwf` (password fingerprint —
  see below), `iss: "inbox-gop-mobile"`, `aud: "inbox-gop-ios"`, `iat`, `exp`. No role,
  clientId, email, or name is embedded — every authenticated request reloads the user
  + client from Postgres (`requireMobileAuth`) before any authorization decision is
  made, so claims can't go stale and there's no PII sitting in a token a device might
  retain. `pwf` is not PII either — it's a one-way fingerprint of the password hash,
  used only to detect a subsequent password change (see below).
- **Refresh token**: opaque random 256-bit token. Only its SHA-256 hash is ever
  persisted (`MobileRefreshToken.refreshTokenHash`); the raw value is returned to the
  client exactly once, at issuance/rotation.
  - `expiresAt` is each individual token's own sliding expiry.
  - `absoluteExpiresAt` is fixed once, at login (`issueMobileSession`), to
    `now + 30 days`, and is copied **unchanged** by every subsequent rotation. This
    is a true hard cap: no matter how often a device refreshes, the whole session
    (token family) cannot outlive 30 days from the original login. Rotation always
    sets the new token's `expiresAt` to `min(now + 30d, absoluteExpiresAt)`.
- **Rotation**: every refresh call invalidates the presented token and mints a new
  one in the same family (`tokenFamilyId`). Rotation is atomic — a conditional
  `updateMany` inside a `$transaction` ensures that of two concurrent refresh calls
  racing on the same token, exactly one succeeds. Presenting an already-rotated
  (revoked) token is treated as replay: the entire token family is revoked
  immediately, logging out every descendant session derived from that original
  login.
- **`firstLogin` / forced password reset**: enforced at three points, not just
  login, so an administrator forcing a reset takes effect immediately rather than
  only at the account's next fresh login:
  1. `POST /auth/login` refuses to issue a session at all (`403
     PASSWORD_RESET_REQUIRED`) if the account's `firstLogin` flag is set.
  2. `requireMobileAuth` — called on every authenticated request — reloads the user
     and rejects with the same `403 PASSWORD_RESET_REQUIRED` if `firstLogin` was
     flipped to `true` after the access token was issued (an access token can
     otherwise stay valid for up to 15 more minutes).
  3. `rotateMobileSession` checks the same flag before minting a new token pair; if
     set, it revokes the entire refresh-token family (so the device can't just keep
     refreshing its way around the block) and returns `403
     PASSWORD_RESET_REQUIRED`.

  The mobile client should route the user to a web-based reset flow
  (`/reset-password` or `/set-password`) in all three cases; this pass does not add
  a mobile-native self-service reset.

  **This `firstLogin` suspension is temporary by design and is not the mechanism that
  permanently revokes a session** — `firstLogin` is cleared back to `false` as soon as
  the user completes the reset, and by itself would let a pre-reset access token
  (still inside its 15-minute TTL) or an unused pre-reset refresh-token family become
  usable again at that point. Permanent invalidation is instead handled by the
  password fingerprint below, which stays mismatched forever once the password hash
  actually changes:
  - Every `MobileRefreshToken` row stores `issuedPasswordFingerprint` — a one-way
    fingerprint (`sha256(password hash).slice(0, 32)`) of the password hash that was
    current at issuance/rotation — and every access token carries the same value as
    its `pwf` claim.
  - `requireMobileAuth` compares the access token's `pwf` claim against the user's
    *current* password hash on every request; a mismatch returns `401
    SESSION_REVOKED` immediately, regardless of `firstLogin`.
  - `rotateMobileSession` runs the same comparison against the refresh row's
    `issuedPasswordFingerprint`; a mismatch revokes the entire token family
    (`revokedReason: "password_changed"`) and returns `401 REFRESH_TOKEN_REUSED`.
  - Together, any real password change — self-service reset, admin-forced reset once
    completed, or a plain profile password update — permanently ends every mobile
    session issued before it, with no dependency on `firstLogin` still being `true`
    at the moment a stale token is used.
  - **Migration note**: the migration that added this column
    (`20260906010000_add_mobile_refresh_password_fingerprint`) cannot know which
    password was current when a pre-existing refresh-token row was actually issued —
    only the user's *current* password hash is available at migration time. Backfilling
    that current fingerprint into an old row would risk blessing a token that predates
    a password change made before the migration ran. To fail closed, the migration
    both backfills the column *and* revokes every row that predates it
    (`revokedReason: "schema_upgrade"`), so **deploying this migration intentionally
    signs out every existing mobile session once**; sessions created after deployment
    are unaffected.
- **Rate limiting**: `MobileAuthAttempt` (Postgres, not in-memory) keys attempts by
  `HMAC-SHA256(MOBILE_JWT_SECRET, "ip:" + ip)` and
  `HMAC-SHA256(MOBILE_JWT_SECRET, "email:" + normalizedEmail)` — raw IP/email/
  password/token are never stored. Login and refresh both return `429
  TOO_MANY_ATTEMPTS` regardless of whether the identifier exists or which limit
  tripped, and old rows are opportunistically deleted on a sampled fraction of
  requests so the table self-trims without a cron job.
- **Caching**: every mobile API response sets `Cache-Control: no-store`.

## Middleware defense-in-depth

`middleware.ts` allow-lists exactly two public paths:
`/api/mobile/v1/auth/login` and `/api/mobile/v1/auth/refresh`. Every other
`/api/mobile/v1/*` request must carry a syntactically valid
`Authorization: Bearer <token>` header just to pass middleware — full cryptographic
verification and the Postgres reload still happen inside the route handler via
`withMobileAuth`/`requireMobileAuth`, which remains the real authorization boundary.

This is backed by an automated static-analysis test —
`lib/services/__tests__/mobile-routes-auth.test.ts`
(`pnpm run test:mobile-routes-auth`) — that inspects every `app/api/mobile/v1/**
/route.ts` file and fails if any exported HTTP method handler other than the two
public routes is not directly assigned `withMobileAuth(...)`, or if a route exports
a raw, unwrapped handler function. A route that forgot to wrap itself in
`withMobileAuth` fails CI instead of shipping silently.

No existing middleware branch (cookie session pages, `/api/v1` API-key routes,
`clientSlug` redirects, cron/webhook paths) was changed.

## Access model for feed data (Competitive Insights)

The mobile feed intentionally mirrors the existing web Competitive Insights feed
(`app/api/competitive-insights/route.ts`) rather than inventing a separate model:

- **Listing** (`GET /feed`) only ever returns campaigns/messages assigned to a
  tracked, non-`data_broker` entity (`entityId IS NOT NULL`, `entity.type !=
  "data_broker"`), plus `isHidden: false` / `isDeleted: false` (and `processed:
  true` for SMS). There is **no `clientId`-based branch in the listing query at
  all** — this is what guarantees a client's own *and* every other client's
  unassigned personal captures (`source: "personal"`, no `entityId`) can never
  appear in the shared feed, by construction rather than by a runtime check that
  could be bypassed by a filter combination.
- **Detail view** (`GET /feed/[id]`) additionally allows a client to view its own
  personal captures directly by ID (`campaign.clientId === callerClientId`), for
  the existing personal-email/personal-numbers features — but never another
  client's.
- Both apply the client's effective retention window: `min(plan CI history days,
  Client.dataRetentionDays)`. This is enforced identically on listing and on direct
  by-ID access, so an item outside the retention window can't be reached just by
  guessing its ID.
- `tag` and `subscriptionsOnly` are resolved to entity-ID sets (via `EntityTag` and
  `CiEntitySubscription`, both scoped to the caller's `clientId`) and intersected
  when both are supplied. An empty resulting set (e.g. `subscriptionsOnly=true` for
  a client following nothing) short-circuits to an empty feed — it is never treated
  as "no restriction."
- Every filter — access scope, entity attributes (`party`/`state`/`office`/
  `entityType`), date-retention floor, cursor, and `search` — is combined via an
  explicit top-level `AND: [...]` array. This matters: spreading multiple
  `{ OR: [...] }` fragments into the same object (the original implementation) is
  broken, because each spread `OR` key silently overwrites the previous one — only
  the last one applied actually took effect, which could drop the access-scope
  clause entirely whenever a search or cursor was also present.

## Cursor pagination

Cursor pagination orders by `(dateReceived DESC, id DESC)` — a stable compound key
so concurrent inserts can't cause duplicate or skipped rows across pages.
`decodeCursor` (`lib/services/feed-service.ts`) returns `null` when no cursor was
supplied, but **throws `400 INVALID_CURSOR`** when a cursor value was supplied and
doesn't decode to a well-formed `{ dateReceived, id }` pair — a malformed cursor is
rejected outright rather than silently treated as "start from the beginning."

## Follow limits and concurrency

`POST /entities/[id]/follow` enforces the client's subscription-plan follow limit
and is safe under concurrent calls (double-taps, multiple devices):

- The existence check, count, and insert run inside one `Serializable` Prisma
  transaction, so two concurrent transactions that would otherwise both read
  "count = limit - 1" and both insert (exceeding the limit) instead conflict — one
  is aborted with a serialization failure and retried with jittered backoff (up to
  8 times). This budget was tested under heavy N-way contention (e.g. six
  concurrent follows landing at once) — do not lower it to match documentation
  elsewhere without re-running that test repeatedly first.
- Following an entity that's already followed is idempotent: a duplicate unique-
  constraint violation (from a race that still slips through) is caught and treated
  as success, never a 500.

## Error shape

All mobile API errors: `{ "error": { "code": "SOME_CODE", "message": "..." } }`
with an appropriate HTTP status. Codes used across the namespace: `MISSING_TOKEN`,
`INVALID_TOKEN`, `TOKEN_EXPIRED`, `SESSION_REVOKED`, `USER_NOT_FOUND`, `CLIENT_NOT_FOUND`,
`CLIENT_INACTIVE`, `PASSWORD_RESET_REQUIRED`, `INVALID_REFRESH_TOKEN`,
`REFRESH_TOKEN_REUSED`, `REFRESH_TOKEN_EXPIRED`, `TOO_MANY_ATTEMPTS`,
`INVALID_CREDENTIALS`, `INVALID_BODY`, `INVALID_CURSOR`, `NO_CLIENT_CONTEXT`,
`FORBIDDEN`, `CI_NOT_ENABLED`, `SUBSCRIPTION_INACTIVE`, `ENTITY_NOT_FOUND`,
`FOLLOW_LIMIT_REACHED`, `NOT_FOUND`, `ALERT_NOT_FOUND`, `INTERNAL_ERROR`.

## Endpoints

### `POST /api/mobile/v1/auth/login` (public)
Body: `{ email, password, deviceId?, deviceName? }`.
On success (`200`): `{ accessToken, refreshToken, expiresIn, tokenType: "Bearer", user: { id, email, firstName, lastName, role } }`.
`403 PASSWORD_RESET_REQUIRED` if the account needs a reset. `429 TOO_MANY_ATTEMPTS`
past the attempt threshold. `401 INVALID_CREDENTIALS` otherwise on failure —
identical whether the email exists or not.

### `POST /api/mobile/v1/auth/refresh` (public)
Body: `{ refreshToken }`. On success (`200`): a new
`{ accessToken, refreshToken, expiresIn, tokenType: "Bearer" }`. `401
INVALID_REFRESH_TOKEN` / `401 REFRESH_TOKEN_REUSED` / `401 REFRESH_TOKEN_EXPIRED`
(also returned once the family's absolute 30-day cap is reached) / `403
PASSWORD_RESET_REQUIRED` on failure.

### `POST /api/mobile/v1/auth/logout` (bearer)
Body: `{ refreshToken }`. Revokes that one session. Response: `200 { success: true
}`. Idempotent — calling it twice, or with an already-revoked/unknown token, still
returns the same success response.

### `GET /api/mobile/v1/auth/me` (bearer)
Returns the current user's profile directly (not wrapped in `data`):
`{ id, email, firstName, lastName, role, firstLogin, client: { id, name, slug, subscriptionPlan, subscriptionStatus, hasCompetitiveInsights, trialExpiresAt } | null }`.

### `GET /api/mobile/v1/context` (bearer)
Lightweight app-shell bootstrap context: `{ userId, role, firstLogin, client: { id, slug, active, subscriptionPlan, subscriptionStatus, hasCompetitiveInsights } | null }`.

### `GET /api/mobile/v1/feed` (bearer)
Cursor-paginated combined feed (emails + SMS). Response:
`{ data: FeedItem[], pagination: { nextCursor: string | null, hasMore: boolean } }`.
Query params: `cursor`, `search`, `party`, `state`, `office`, `entityType`,
`messageType` (`email`|`sms`), `tag`, `subscriptionsOnly` (`"true"`). See "Access
model" and "Cursor pagination" above for the authorization and pagination rules.
`400 INVALID_CURSOR` for a malformed `cursor` value.

### `GET /api/mobile/v1/feed/filters` (bearer)
Static filter facets for building the mobile filter UI:
`{ states: string[], parties: { value, label }[], offices: { value, label, match }[] }`
(from `lib/campaign-filter-options.ts`).

### `GET /api/mobile/v1/feed/[id]?type=email|sms` (bearer)
Single campaign/message detail: `{ data: FeedItem & { emailContent, emailPreview, ctaLinks } }`.
`404 NOT_FOUND` if the item doesn't exist, is hidden/deleted, is outside the
client's retention window, is unprocessed SMS, or isn't accessible to the caller
(not shared and not the caller's own personal record) — the same `404` in every
case, to avoid confirming existence across tenants.

### `GET /api/mobile/v1/entities/followed` (bearer)
Entities (`CiEntity`) the caller's client currently follows: `{ data: CiEntity[] }`.

### `POST /api/mobile/v1/entities/[id]/follow` (bearer)
Follows a `CiEntity`, enforcing the plan follow limit (concurrency-safe — see
above). Response: `{ following: true, alreadyFollowing: boolean }`.
`404 ENTITY_NOT_FOUND` if the entity doesn't exist. `403 FOLLOW_LIMIT_REACHED` if
the plan's follow limit is already reached and this isn't a repeat follow.

### `DELETE /api/mobile/v1/entities/[id]/follow` (bearer)
Unfollows a `CiEntity`. Response: `{ following: false }`. Idempotent.

### `GET /api/mobile/v1/alerts` (bearer)
Lists `CampaignAlertSubscription` rows for the caller: `{ data: CampaignAlertSubscription[] }`.

### `POST /api/mobile/v1/alerts` (bearer)
Body: `{ name, party?, state?, office? }` (at least one of `party`/`state`/`office`
required). Response (`201`): `{ data: CampaignAlertSubscription }`.
`400 INVALID_BODY` if `name` is missing or all three criteria are missing.

### `DELETE /api/mobile/v1/alerts/[id]` (bearer)
Deletes an alert the caller owns. Response: `{ ok: true }`. `404 ALERT_NOT_FOUND`
if it doesn't exist, `403 FORBIDDEN` if it belongs to someone else.

## Tests

- `pnpm run test:mobile-routes-auth` — static analysis proving every non-public
  route uses `withMobileAuth`.
- `pnpm run test:mobile-auth` — token issuance/verification, header validation,
  issuer/audience/typ/secret checks, expiry, `requireMobileAuth`'s Postgres reload
  and inactive-client/forced-reset handling, refresh rotation + replay + concurrency
  + absolute expiry, logout, rate limiting, cross-client item access.
- `pnpm run test:mobile-feed` — feed access scope (shared vs. personal vs.
  data-broker), `subscriptionsOnly`/`tag` filters (including the empty-result case),
  search (email + SMS), unprocessed-SMS exclusion, retention-window enforcement on
  both listing and detail, malformed-cursor rejection, and second-page cursor
  pagination correctness.
- `pnpm run test:mobile-entities` — follow idempotency and follow-limit enforcement
  under concurrency.
- `pnpm run test:mobile` — runs all of the above in sequence.

## What was intentionally not changed

- Web cookie login, session shape, and `JWT_SECRET` usage (`lib/auth.ts`).
- `/api/v1/*` API-key auth (`lib/api-auth.ts`).
- `clientSlug` routing/redirect behavior in `middleware.ts` for non-mobile paths.
- No service worker was added; no route in this namespace uses a public/shared
  cache directive; no wildcard CORS header was introduced anywhere in the app.

## Required environment variable

- `MOBILE_JWT_SECRET` — signs/verifies mobile access tokens and keys the rate-limit
  HMAC. Distinct from the web app's `JWT_SECRET` so a leak of one cannot be used to
  forge the other.

## Known repo-wide issues (not introduced by, and out of scope for, this pass)

- **`pnpm run build` fails on a clean install** with `ERR_PACKAGE_PATH_NOT_EXPORTED`
  from `zod/package.json` (no `./v4` export), imported by `@ai-sdk/provider-utils`
  via the `eve` package's dependency chain (`next.config.mjs` calls `withEve(...)`
  unconditionally). This reproduces identically on the pre-mobile-pass code once
  actually installed clean — it is a pre-existing conflict between `eve`'s pinned
  AI SDK version (which expects zod v4) and this project's zod v3 pin (`zod@^3.24.1`,
  used throughout `lib/*-classifier.ts` and `lib/ci-entity-utils.ts` via
  `generateObject`/`generateText`), not something this pass touched or can safely
  resolve — bumping to zod v4 is a separate, wider migration. `pnpm run lint` and
  `pnpm run test:mobile*` are unaffected since neither loads `next.config.mjs`.
- `pnpm run lint` (unscoped, whole repo) fails with ~14,800 pre-existing errors, almost
  entirely `@typescript-eslint/no-require-imports` from legacy `.js` files under
  `scripts/` that predate this pass by a wide margin and are unrelated to the mobile
  API. Every file this pass touched or added — `lib/mobile-auth.ts`,
  `lib/services/{feed,entity,alert,user}-service.ts`, `lib/services/authz.ts`, all
  `app/api/mobile/v1/**/route.ts` files, the `lib/services/__tests__/*.ts` scripts,
  and `components/sidebar.tsx`/`components/app-layout.tsx` — lints clean in isolation:
  `pnpm exec eslint <path>` against that exact file list reports zero errors and zero
  warnings.
