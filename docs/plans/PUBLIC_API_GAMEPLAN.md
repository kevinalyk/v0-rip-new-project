# Public API — Long-Term Gameplan

## Overview

This document outlines the full plan for building a monetizable public API on top of the RIP platform. The goal is to give external developers and partners (starting with internal testing) programmatic access to email and SMS competitive intelligence data, while protecting sensitive internal fields and maintaining strict client data isolation.

The plan is split into four phases. Phase 1 is the immediate priority and can be shipped quickly. Phases 2–4 are longer-term and should be built incrementally as demand grows.

---

## What We Are Exposing (and What We Are Not)

### Exposable

| Data | Notes |
|---|---|
| `CompetitiveInsightCampaign` (emails) | Strip `seenBySeedEmails`, `resultIds`, `emailContent`, `isHidden`, `isDeleted`, `deletedBy`, `hiddenBy` |
| `SmsQueue` (SMS) | Strip `phoneNumber`, `toNumber`, `rawData`, `isHidden`, `isDeleted`, `deletedBy`, `hiddenBy` |
| `CiEntity` | Fully exposable — name, type, party, state, description |
| `CiEntityMapping` | Sender emails/domains/phones are fine — these are public campaign senders |
| Client's own subscriptions (`CiEntitySubscription`) | Only their own `clientId` rows |
| Client's own entity tags (`EntityTag`) | Only their own `clientId` rows |

### Never Expose

| Data | Reason |
|---|---|
| `seenBySeedEmails` / `resultIds` on campaigns | Exposes our seed infrastructure |
| `inboxCount` / `spamCount` / `inboxRate` on campaigns | Proprietary placement data — potential upsell |
| `phoneNumber` / `toNumber` on SMS | PII |
| `rawData` on `SmsQueue` | Raw webhook payload, internal only |
| `SeedEmail` table | Entirely internal |
| `User` table | PII and internal |
| `Client` table (other clients) | Cross-client data isolation |
| `Campaign` / `Result` / `Domain` tables | Internal inbox testing infrastructure |
| `EmailQueue` / `CronJobState` / `Setting` | Internal ops |
| `password`, `accessToken`, `refreshToken` on any model | Credentials |

### Placement Data (Inbox/Spam) — Special Case

The `inboxCount`, `spamCount`, `inboxRate`, and `notDeliveredCount` fields on `CompetitiveInsightCampaign` are among our most valuable proprietary signals. For Phase 1, **omit these entirely**. In later phases, consider offering placement data as a paid tier upgrade — it is a genuine competitive moat.

---

## Phase 1 — Core Infrastructure + Read Endpoints (Build First)

This is what Lucas needs for testing and what we can ship quickly.

### 1.1 — Database: `ApiKey` Table

Add the following to `schema.prisma`:

```prisma
model ApiKey {
  id          String    @id @default(cuid())
  name        String                          // Human label e.g. "Lucas Dev Key"
  keyHash     String    @unique               // SHA-256 of the raw key — never store plaintext
  keyPrefix   String                          // First 8 chars of raw key for display e.g. "rip_live"
  clientId    String                          // Scopes this key to one client
  scopes      Json      @default("[]")        // e.g. ["campaigns:read", "sms:read", "entities:read"]
  rateLimit   Int       @default(1000)        // Requests per hour
  active      Boolean   @default(true)
  lastUsedAt  DateTime?
  expiresAt   DateTime?                       // null = never expires
  createdBy   String                          // User ID who generated it
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  client      Client    @relation(fields: [clientId], references: [id], onDelete: Cascade)

  @@index([keyHash])
  @@index([clientId])
  @@index([active])
}
```

Add the corresponding `apiKeys ApiKey[]` relation to the `Client` model.

**Migration:** Write and run `scripts/add-api-key-table.sql`.

**Key generation:** On creation, generate a `crypto.randomBytes(32).toString("hex")` raw key. Show it to the user **once** — this is the only time the plaintext is available. Store only the SHA-256 hash.

**Key format:** Prefix with `rip_live_` for production keys, `rip_test_` for test keys. Makes it easy to identify in logs.

### 1.2 — Auth Middleware: `lib/api-auth.ts`

Create a shared utility that:
1. Reads the `Authorization: Bearer <key>` header
2. Hashes the incoming key with SHA-256
3. Looks up the hash in `ApiKey` where `active = true` and `expiresAt > now OR expiresAt IS NULL`
4. Returns the resolved `clientId` and `scopes`
5. Updates `lastUsedAt` asynchronously (fire-and-forget, don't block the request)
6. Returns a 401 if key not found, 403 if scope missing

```ts
// lib/api-auth.ts
export async function authenticateApiKey(request: Request): Promise<{ clientId: string; scopes: string[] } | null>
export function requireScope(scopes: string[], required: string): boolean
```

**Do not reuse the cookie-based `requireSuperAdmin` / `requireAuth` functions** — those are session-based. API auth is purely Bearer token.

### 1.3 — Versioned API Routes Under `/api/v1/`

All public API routes live under `app/api/v1/`. This version prefix allows us to make breaking changes later under `/api/v2/` without disrupting existing integrations.

#### Endpoints for Phase 1

```
GET /api/v1/campaigns          — list email campaigns (paginated)
GET /api/v1/campaigns/:id      — single campaign
GET /api/v1/sms                — list SMS messages (paginated)
GET /api/v1/sms/:id            — single SMS message
GET /api/v1/entities           — list CiEntities
GET /api/v1/entities/:id       — single entity
```

#### Standard Response Envelope

All responses use a consistent shape:

```json
{
  "data": [...],
  "meta": {
    "total": 1482,
    "page": 1,
    "pageSize": 50,
    "hasMore": true
  },
  "error": null
}
```

Errors:
```json
{
  "data": null,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or missing API key"
  }
}
```

#### Standard Query Parameters

| Param | Type | Description |
|---|---|---|
| `page` | number | Page number, 1-indexed. Default: 1 |
| `pageSize` | number | Records per page. Default: 50, max: 200 |
| `from` | ISO date string | Filter by date >= this value |
| `to` | ISO date string | Filter by date <= this value |
| `entityId` | string | Filter campaigns/SMS by entity |
| `party` | string | Filter by party (`republican`, `democrat`, `independent`) |
| `donationPlatform` | string | Filter campaigns by platform (`winred`, `actblue`, `anedot`, `psq`) |

### 1.4 — Field Redaction Per Endpoint

Create a `lib/api-redact.ts` utility with typed redactor functions. Each function takes the raw Prisma record and returns the safe public shape.

```ts
// lib/api-redact.ts

export function redactCampaign(campaign: CompetitiveInsightCampaign) {
  return {
    id: campaign.id,
    senderName: campaign.senderName,
    senderEmail: campaign.senderEmail,
    subject: campaign.subject,
    dateReceived: campaign.dateReceived,
    tags: campaign.tags,
    emailPreview: campaign.emailPreview,
    ctaLinks: redactCtaLinks(campaign.ctaLinks),   // strip internal tracking data
    entityId: campaign.entityId,
    donationPlatform: campaign.donationPlatform,
    source: campaign.source,
    // OMITTED: seenBySeedEmails, resultIds, emailContent, inboxCount,
    //          spamCount, inboxRate, notDeliveredCount, isHidden,
    //          isDeleted, hiddenBy, deletedBy, shareToken, rawSubject
  }
}

export function redactSms(sms: SmsQueue) {
  return {
    id: sms.id,
    message: sms.message,
    ctaLinks: sms.ctaLinks,
    entityId: sms.entityId,
    donationPlatform: null,  // not yet on SMS
    assignmentMethod: sms.assignmentMethod,
    assignedAt: sms.assignedAt,
    createdAt: sms.createdAt,
    // OMITTED: phoneNumber, toNumber, rawData, isHidden, isDeleted,
    //          hiddenBy, deletedBy, dedupHash, shareToken
  }
}

export function redactEntity(entity: CiEntity) {
  return {
    id: entity.id,
    name: entity.name,
    type: entity.type,
    party: entity.party,
    state: entity.state,
    description: entity.description,
    createdAt: entity.createdAt,
    // donationIdentifiers deliberately omitted — exposes our mapping logic
  }
}
```

### 1.5 — Developer Portal UI

Add a "Developers" section to the client admin area (under the existing Admin menu). This page lets admins:

- View their API keys (prefix + created date + last used — never full key)
- Generate a new key (show plaintext once, then never again)
- Revoke keys
- See their assigned scopes

This does not need to be elaborate for Phase 1 — a simple list + generate button is fine.

**Files to create:**
- `app/[clientSlug]/admin/developers/page.tsx`
- `app/api/admin/api-keys/route.ts` (GET list, POST create)
- `app/api/admin/api-keys/[id]/route.ts` (DELETE revoke)

### 1.6 — Rate Limiting

For Phase 1, implement simple in-memory rate limiting using Upstash Redis (already available in the project). Key: `ratelimit:apikey:{keyId}`, window: 1 hour, limit stored on the `ApiKey` record.

Use a sliding window counter: increment on each request, return 429 with `Retry-After` header when exceeded.

```ts
// In each API route handler:
const { clientId, scopes, keyId, rateLimit } = await authenticateApiKey(request)
await checkRateLimit(keyId, rateLimit) // throws 429 if exceeded
```

---

## Phase 2 — Usage Metering + Monetization Infrastructure

Once Phase 1 is stable and we have at least one paying API customer, add:

### 2.1 — `ApiKeyUsage` Table

Track per-request usage for billing:

```prisma
model ApiKeyUsage {
  id        String   @id @default(cuid())
  keyId     String
  endpoint  String   // e.g. "/api/v1/campaigns"
  method    String   // "GET"
  statusCode Int
  recordsReturned Int @default(0)
  requestedAt DateTime @default(now())

  apiKey    ApiKey   @relation(fields: [keyId], references: [id], onDelete: Cascade)

  @@index([keyId, requestedAt])
  @@index([requestedAt])
}
```

This lets us:
- Bill by request count or records returned
- Show usage dashboards to customers
- Alert when approaching tier limits

### 2.2 — Tiers and Scopes

Define named tiers with associated scope sets and rate limits:

| Tier | Monthly Price | Rate Limit | Scopes | Notes |
|---|---|---|---|---|
| `free` | $0 | 100 req/hr | `campaigns:read`, `entities:read` | No SMS, no placement data |
| `basic` | TBD | 1,000 req/hr | `campaigns:read`, `sms:read`, `entities:read` | |
| `pro` | TBD | 10,000 req/hr | All + `placement:read` | Includes inbox/spam rates |
| `enterprise` | Custom | Unlimited | All | SLA, dedicated support |

The `placement:read` scope unlocks `inboxCount`, `spamCount`, `inboxRate`, and `notDeliveredCount` on campaign responses.

### 2.3 — Stripe Integration for API Billing

Add a new Stripe subscription item for API access, separate from the existing base plan and CI add-on. Usage-based billing can be done via Stripe metered billing tied to `recordsReturned` in `ApiKeyUsage`.

---

## Phase 3 — Write Endpoints + Webhooks

After we have customers actively using read endpoints, consider:

### 3.1 — Write Endpoints

```
POST /api/v1/entities/:id/tags       — create entity tags
DELETE /api/v1/entities/:id/tags/:id — remove entity tags
POST /api/v1/entities/:id/subscribe  — subscribe to an entity
```

These are lower priority but would make the API much more useful for programmatic workflows (e.g. automatically tagging entities based on external signals).

### 3.2 — Webhooks

Push new campaigns/SMS to customer endpoints in real time rather than requiring polling:

```
POST /api/v1/webhooks      — register a webhook URL + events
DELETE /api/v1/webhooks/:id
GET /api/v1/webhooks        — list registered webhooks
```

Events: `campaign.created`, `sms.received`, `entity.assigned`.

Delivery: queue webhook payloads into a retry-safe job queue (Upstash QStash is ideal here). Sign payloads with HMAC-SHA256 so customers can verify authenticity.

### 3.3 — Bulk Export Endpoint

For customers like Lucas who want to do ML/modeling on the full dataset:

```
GET /api/v1/export/campaigns   — returns a URL to a pre-generated JSONL file (Vercel Blob)
GET /api/v1/export/sms
```

Generate exports nightly via cron, cache in Blob storage, return signed URL. Avoids hammering the database with large paginated queries.

---

## Phase 4 — Developer Experience

Once the API is generating revenue, invest in DX:

- **OpenAPI / Swagger spec** — auto-generate from route handlers using `next-swagger-doc` or Zod schemas
- **Postman collection** — publish a public Postman workspace
- **SDKs** — TypeScript SDK (publish to npm as `@rip/sdk`), Python SDK (publish to PyPI as `rip-sdk`)
- **Interactive docs page** — `/developers` public-facing page with live API explorer
- **API status page** — uptime monitoring per endpoint

---

## Testing Strategy

### Unit Tests (per phase)

- Test `redactCampaign`, `redactSms`, `redactEntity` — verify no forbidden fields leak through
- Test `authenticateApiKey` — valid key, expired key, revoked key, wrong hash
- Test `checkRateLimit` — under limit, at limit, over limit

### Integration Tests

- Spin up a test database with seeded `ApiKey`, `CompetitiveInsightCampaign`, `SmsQueue`, `CiEntity` rows
- Hit each endpoint with a valid key — verify correct fields returned, correct pagination
- Hit each endpoint with no key — verify 401
- Hit endpoint with key missing required scope — verify 403
- Exceed rate limit — verify 429 with `Retry-After` header
- Request data belonging to a different client — verify empty results (not 403, not someone else's data)

### Manual Testing (Phase 1)

For Lucas's immediate use:
1. Generate a key manually via the Developer portal (or directly in the DB for now)
2. Hit `/api/v1/campaigns?pageSize=200` and pipe to a JSONL file
3. Verify field redaction looks correct in the response before handing off

### Environment Separation

- Use `rip_test_` prefixed keys for staging/test environments
- Rate limits on test keys can be lower
- Consider a separate `RIP_API_ENABLED` env var to gate the feature globally before it's ready

---

## Files to Create (Phase 1 Summary)

```
prisma/schema.prisma                          — add ApiKey model + Client relation
scripts/add-api-key-table.sql                 — migration
lib/api-auth.ts                               — Bearer token auth middleware
lib/api-redact.ts                             — field-level redaction utilities
lib/api-rate-limit.ts                         — Redis-based rate limiting
app/api/v1/campaigns/route.ts                 — GET list
app/api/v1/campaigns/[id]/route.ts            — GET single
app/api/v1/sms/route.ts                       — GET list
app/api/v1/sms/[id]/route.ts                  — GET single
app/api/v1/entities/route.ts                  — GET list
app/api/v1/entities/[id]/route.ts             — GET single
app/[clientSlug]/admin/developers/page.tsx    — Developer portal UI
app/api/admin/api-keys/route.ts               — List + create keys
app/api/admin/api-keys/[id]/route.ts          — Revoke key
```

---

## Open Questions

1. **Who controls which clients get API access?** — probably a super_admin toggle on the Client record (`hasApiAccess Boolean @default(false)`), similar to `hasCompetitiveInsights`.
2. **Do we expose all CI entities globally, or only entities the client is subscribed to?** — probably subscribed-only for now to limit scope. Can open up to all entities for higher tiers.
3. **Do we charge for the API separately from the base RIP subscription, or bundle it?** — separate add-on makes more sense for monetization.
4. **What data does Lucas specifically need?** — clarify whether he needs placement data (inbox/spam rates) or just campaign metadata + SMS. This determines whether we need to implement the `placement:read` scope in Phase 1 or can defer to Phase 2.
5. **Rate limit granularity** — per API key (recommended) or per client (simpler but less flexible for clients with multiple keys)?
