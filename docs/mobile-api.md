# Mobile API (`/api/mobile/v1`)

A versioned, bearer-token-authenticated API namespace for a future native/Expo mobile
client. Entirely separate from:

- The browser cookie session (`lib/auth.ts`, `JWT_SECRET`) used by the Next.js web app.
- The developer API-key namespace (`lib/api-auth.ts`, `ApiKey` model, `/api/v1/*`).

Nothing in either of those was modified. This document covers auth, error shapes,
and every endpoint added in this pass.

## Auth model

- **Access token**: short-lived JWT (15 min), HS256, signed with `MOBILE_JWT_SECRET`
  (required env var, no fallback — the module throws at import time if unset).
  Claims: `sub` (userId), `typ: "access"`, `iss: "inbox-gop-mobile"`,
  `aud: "inbox-gop-mobile-app"`, `iat`, `exp`. No role, clientId, email, or name is
  embedded — every authenticated request reloads the user + client from Postgres
  (`requireMobileAuth`) before any authorization decision is made, so claims can't
  go stale and there's no PII sitting in a token a device might retain.
- **Refresh token**: opaque random 256-bit token, 30-day expiry. Only its SHA-256
  hash is ever persisted (`MobileRefreshToken.refreshTokenHash`); the raw value is
  returned to the client exactly once, at issuance/rotation.
- **Rotation**: every refresh call invalidates the presented token and mints a new
  one in the same family (`tokenFamilyId`). Rotation is atomic — a conditional
  `updateMany` inside a `$transaction` ensures that of two concurrent refresh calls
  racing on the same token, exactly one succeeds. Presenting an already-rotated
  (revoked) token is treated as replay: the entire token family is revoked
  immediately, logging out every descendant session derived from that original
  login.
- **Rate limiting**: `MobileAuthAttempt` (Postgres, not in-memory) keyes attempts by
  `sha256(MOBILE_JWT_SECRET + ":ip:" + ip)` and `sha256(MOBILE_JWT_SECRET + ":email:" + normalizedEmail)`
  — raw IP/email/password/token are never stored. Login and refresh return the same
  generic `RATE_LIMITED` error regardless of whether the identifier exists, and old
  rows are opportunistically deleted on a sampled fraction of requests so the table
  self-trims without a cron job.
- **`firstLogin` / forced password reset**: mirrors the web app's behavior. If the
  user record requires a password reset, mobile `login` returns
  `403 PASSWORD_RESET_REQUIRED` and issues no tokens. The client should route the
  user to a web-based reset flow (`/reset-password` or `/set-password`); this pass
  does not add a mobile-native self-service reset.
- **Caching**: every auth response sets `Cache-Control: no-store`.

## Middleware defense-in-depth

`middleware.ts` allow-lists exactly two public paths:
`/api/mobile/v1/auth/login` and `/api/mobile/v1/auth/refresh`. Every other
`/api/mobile/v1/*` request must carry a syntactically valid
`Authorization: Bearer <token>` header just to pass middleware — full
cryptographic verification and the Postgres reload still happen inside the route
handler via `withMobileAuth`/`requireMobileAuth`. This means a route handler that
forgets to call `withMobileAuth` still can't be reached without *some* bearer
header, though it would not be properly protected — `withMobileAuth` remains the
real authorization boundary.

No existing middleware branch (cookie session pages, `/api/v1` API-key routes,
`clientSlug` redirects, cron/webhook paths) was changed.

## Error shape

All mobile API errors: `{ "error": { "code": "SOME_CODE", "message": "..." } }`
with an appropriate HTTP status. Codes used: `MISSING_TOKEN`, `INVALID_TOKEN`,
`TOKEN_EXPIRED`, `INVALID_REFRESH_TOKEN`, `REFRESH_TOKEN_REUSED`,
`REFRESH_TOKEN_EXPIRED`, `RATE_LIMITED`, `INVALID_CREDENTIALS`,
`PASSWORD_RESET_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`.

## Endpoints

### `POST /api/mobile/v1/auth/login` (public)
Body: `{ email, password, deviceId?, deviceName? }`.
On success: `{ accessToken, refreshToken, expiresIn, user: { id, email, name, role, clientId } }`.
`PASSWORD_RESET_REQUIRED` (403) if the account needs a reset. `RATE_LIMITED` (429)
past the attempt threshold. `INVALID_CREDENTIALS` (401) otherwise on failure —
identical whether the email exists or not.

### `POST /api/mobile/v1/auth/refresh` (public)
Body: `{ refreshToken }`. Returns a new `{ accessToken, refreshToken, expiresIn }`
pair. `INVALID_REFRESH_TOKEN` / `REFRESH_TOKEN_REUSED` / `REFRESH_TOKEN_EXPIRED` on
failure.

### `POST /api/mobile/v1/auth/logout` (bearer)
Body: `{ refreshToken }`. Revokes that one session. Idempotent — calling it twice,
or with an already-revoked token, still returns `204`.

### `GET /api/mobile/v1/auth/me` (bearer)
Returns the current user's profile (id, email, name, role, clientId, clientName).

### `GET /api/mobile/v1/context` (bearer)
Returns lightweight app-shell context: current user + the client's subscription
plan limits (follow limits, retention window) via `lib/subscription-utils.ts`.

### `GET /api/mobile/v1/feed` (bearer)
Cursor-paginated combined feed (emails + SMS) scoped to the caller's `clientId`,
respecting hidden/deleted flags and the client's data-retention window. Query
params: `cursor`, `limit` (max 50), `entityId`, `type` (`email`|`sms`), `search`.
Cursor pagination orders by `(dateReceived DESC, id DESC)` — a stable compound key
so concurrent inserts can't cause duplicate or skipped rows across pages.

### `GET /api/mobile/v1/feed/filters` (bearer)
Returns the available filter facets (entities, types) for the caller's client,
via `lib/campaign-filter-options.ts`.

### `GET /api/mobile/v1/feed/[id]` (bearer)
Single feed item detail. 404s (not 403) if the item exists but belongs to a
different client, to avoid confirming existence across tenants.

### `GET /api/mobile/v1/entities/followed` (bearer)
Entities (CiEntity) the caller's client currently follows.

### `POST /api/mobile/v1/entities/[id]/follow` / `DELETE .../follow` (bearer)
Follow/unfollow a `CiEntity`. Enforces the client's subscription-plan follow limit
on `POST` (`FORBIDDEN` with a plan-limit message if exceeded) and client isolation
on both.

### `GET /api/mobile/v1/alerts` / `POST /api/mobile/v1/alerts` (bearer)
List/create `CampaignAlertSubscription` rows for the caller, scoped to their
client's visible campaigns.

### `DELETE /api/mobile/v1/alerts/[id]` (bearer)
Deletes an alert the caller owns. `404` if it belongs to someone else or another
client.

## What was intentionally not changed

- Web cookie login, session shape, and `JWT_SECRET` usage (`lib/auth.ts`).
- `/api/v1/*` API-key auth (`lib/api-auth.ts`).
- `clientSlug` routing/redirect behavior in `middleware.ts` for non-mobile paths.
- No service worker was added; no route in this namespace uses a public/shared
  cache directive; no wildcard CORS header was introduced anywhere in the app.

## Required environment variable

- `MOBILE_JWT_SECRET` — signs/verifies mobile access tokens. Distinct from the web
  app's `JWT_SECRET` so a leak of one cannot be used to forge the other.
