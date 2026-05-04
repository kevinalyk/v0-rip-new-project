# MCP Server — Gameplan

## Overview

Ship an MCP (Model Context Protocol) server that exposes RIP Tool's CI data (entities, emails, SMS) to AI clients like Claude Desktop, Cursor, and any custom bot a user wants to build. Once shipped, a user can say "Claude, show me every Trump email from this week mentioning Iowa" and get a real answer with citations. They can also build polling bots ("notify me when Trump sends new SMS") on top of the same surface.

This is **read-only forever** — no write tools will be exposed.

---

## What We Already Have (Big Win)

This build is dramatically smaller than starting from scratch. Existing infrastructure:

| Piece | Status | File |
|---|---|---|
| `ApiKey` table with hashing, scopes, rate limit, expiration, revocation | Built | `prisma/schema.prisma:631` |
| `withApiAuth` middleware (Bearer token, scope check, rate limit) | Built | `lib/api-auth.ts` |
| `generateApiKey()` (`rip_pk_*` format) + SHA-256 hashing | Built | `lib/api-auth.ts` |
| Sanitization layer (strips internal fields, PII, placement data) | Built | `lib/api-redact.ts` |
| Public REST API endpoints | Built | `app/api/v1/{campaigns,sms,entities}` |
| Admin UI to issue/revoke keys (super-admin only) | Built | `app/[clientSlug]/developers/api-keys` |

The MCP server is a **thin npm package** that wraps the existing `/api/v1/*` REST endpoints in MCP tool definitions. No new auth system, no new table, no new core API.

---

## What's Actually New

1. **One npm package** (`@rip-tool/mcp-server`) that runs as a stdio subprocess. Users install it via `npx` and add it to their Claude Desktop config. Same pattern as every other published MCP server.
2. **Two new search endpoints** under `/api/v1/` that the MCP layer needs but the REST API doesn't currently expose (full-text search across all comms; combined recent-activity feed). These are the only backend changes.
3. **One new scope** (`mcp:read`) added to the existing `ApiKey.scopes` enum so MCP-issued tokens can be distinguished from generic REST API tokens. This is optional — we could just lean on `campaigns:read`, `sms:read`, `entities:read`.
4. **Documentation page** under `/developers` explaining how to install and configure the MCP server. NOT a new key-management page — the existing `/developers/api-keys` page handles that. We just need a "How to use these keys with Claude" walkthrough.

That's the entire scope.

---

## Phase 1 — Ship to Internal Users (Half-Day Build)

### 1.1 — npm Package: `@rip-tool/mcp-server`

A separate repo (or a `packages/mcp-server` workspace inside the monorepo, depending on how you want to structure it). Built with the official `@modelcontextprotocol/sdk` TypeScript SDK.

**Tools exposed in v1:**

| Tool | Wraps | Purpose |
|---|---|---|
| `find_entity({ name })` | `GET /api/v1/entities?search=` | Resolve a name to an entity ID |
| `list_entities({ party?, state?, type?, limit? })` | `GET /api/v1/entities` | Browse entities |
| `search_emails({ query?, entityId?, senderEmail?, from?, to?, limit? })` | `GET /api/v1/campaigns` (+ new full-text search endpoint, see 1.2) | Search the email corpus |
| `search_sms({ query?, entityId?, phoneNumber?, from?, to?, limit? })` | `GET /api/v1/sms` (+ new full-text search endpoint, see 1.2) | Search the SMS corpus |
| `get_email({ id })` | `GET /api/v1/campaigns/[id]` | Fetch one email |
| `get_sms({ id })` | `GET /api/v1/sms/[id]` | Fetch one SMS |
| `recent_activity({ entityId?, sinceMinutes?, limit? })` | New endpoint, see 1.2 | The polling primitive bots need |

That's 7 tools. Every tool is a thin wrapper:
1. Take typed args (Zod schema in the MCP layer).
2. Build a query string.
3. Call the existing REST endpoint with the user's PAT in `Authorization: Bearer ...`.
4. Return the JSON response unchanged (the REST layer already sanitizes).

The whole package is probably ~300 lines of code.

### 1.2 — Two New REST Endpoints

These don't exist yet, and the MCP wouldn't be useful without them.

#### `GET /api/v1/search`

Full-text search across emails AND SMS combined. The current `/api/v1/campaigns` and `/api/v1/sms` endpoints filter by sender / entity / date but not by message body content. The MCP needs `query` to mean "find me any message mentioning X."

```
GET /api/v1/search?q=iowa&type=all&from=2026-04-01&limit=50
  → { data: [{ kind: 'email' | 'sms', ...sanitizedRow }, ...], pagination }
```

Backed by Postgres full-text search on `subject + plainTextBody` for emails and `messageBody` for SMS. We already do similar searching in `/api/competitive-insights` and `/api/ci/personal-numbers` — just port the same `OR` clause into a v1-flavored handler with sanitization applied.

#### `GET /api/v1/recent`

Combined feed across emails + SMS, ordered by date desc, with a `since` cursor. The polling primitive Ryan's bot would use:

```
GET /api/v1/recent?entityId=...&sinceMinutes=60&limit=100
  → { data: [{ kind, ...sanitizedRow }, ...], cursor: '<iso>' }
```

Both endpoints reuse `withApiAuth` + sanitization helpers; minimal new code.

### 1.3 — `mcp:read` Scope (Optional)

Add `"mcp:read"` to the default scopes when a key is generated for MCP use. The two new endpoints check for it. Existing REST keys keep working with `campaigns:read` / `sms:read` / `entities:read`. The benefit is being able to generate "MCP-only" tokens for users who shouldn't have full REST access. Skippable for v1.

### 1.4 — Documentation Page: `/developers/mcp`

New page at `app/[clientSlug]/developers/mcp/page.tsx` (super-admin only, same gating as the existing api-keys page). Content:

- 30-second pitch ("Use Claude to search your inbox.")
- Step 1: "Generate a Personal Access Token" — link to the existing `/developers/api-keys` page.
- Step 2: Copy/paste config block for Claude Desktop:
  ```json
  {
    "mcpServers": {
      "rip-tool": {
        "command": "npx",
        "args": ["-y", "@rip-tool/mcp-server"],
        "env": { "RIP_API_TOKEN": "rip_pk_..." }
      }
    }
  }
  ```
- Step 3: Restart Claude. Try a sample prompt.
- Tool reference: brief description of each of the 7 tools.
- Troubleshooting: common errors (401 = bad token, 429 = rate limited, etc.).

The existing api-keys page gets a small note: "Tokens with `mcp:read` scope can be used with the MCP server — see [link]."

### 1.5 — Sidebar Nav Entry

Add "MCP Server" under the existing Developers section in `components/sidebar.tsx`. Same super-admin gating as api-keys.

---

## Hosting & Distribution

**Phase 1 transport: stdio via `npx`.** Users install nothing globally — `npx -y @rip-tool/mcp-server` downloads and runs the package on demand. Works in Claude Desktop, Cursor, and any other MCP client today.

**Where to publish:**
- npm: `@rip-tool/mcp-server` (public package). The package itself contains no secrets — the user's PAT is passed in via env var at runtime.
- GitHub: separate repo `rip-tool/mcp-server` (or a `packages/` workspace). Either is fine.
- Vercel deploys nothing for the MCP package itself. The two new `/api/v1/*` endpoints deploy automatically with the main app.

**Phase 2 transport (later): HTTP/SSE.** Add a server-side MCP endpoint at `/api/mcp` for web-based MCP clients. Same tool definitions, different transport. Skip for v1.

---

## Rate Limiting

Already solved. `withApiAuth` enforces `apiKey.rateLimit` requests/minute (defaults to 100, configurable per key). Every MCP tool call hits a `/api/v1/*` endpoint, so it gets rate-limited automatically.

**One adjustment to consider:** raise the default from 100/min to 200/min for keys with the `mcp:read` scope, since AI clients tend to make 3-5 calls per user prompt. Not blocking for v1 — users can ask for higher limits per key.

---

## Read-Only Guarantee

Locked at four layers, so accidentally exposing a write tool requires deliberate effort:

1. **MCP package only registers GET-shaped tools.** No `create_*`, `update_*`, `delete_*` tool definitions exist in the codebase.
2. **`withApiAuth` doesn't validate write scopes.** Any future write endpoint would need its own scope; MCP-issued tokens don't get them.
3. **`/api/v1/*` only exposes GET handlers.** No POST/PATCH/DELETE in this namespace.
4. **`@rip-tool/mcp-server`'s `package.json` declares no write capabilities** in its MCP capability advertisement, so even a misbehaving client can't trigger them.

If we ever do want write capabilities (years from now), it's a deliberate, multi-step opt-in.

---

## Security & Observability

- **PAT format:** `rip_pk_*` (already implemented). 64 chars, SHA-256 hashed in DB, never re-displayable after creation.
- **Scope on the key, not the request:** the user generates a key with `mcp:read` and uses that key in their Claude config. We never have to pass scope info per request.
- **Audit log:** `apiKey.lastUsedAt` and `requestCount` already update on every call. Add a per-call log table later if needed (Phase 2).
- **Token rotation:** existing revoke flow on the api-keys page already covers this.
- **Abuse signal:** spike in `requestCount` for a single key is the canary. Build a dashboard tile in Phase 2.

---

## Effort Estimate

| Task | Effort |
|---|---|
| New `/api/v1/search` endpoint | 1-2 hr |
| New `/api/v1/recent` endpoint | 1 hr |
| `@rip-tool/mcp-server` npm package (7 tools, Zod schemas, README) | 2-3 hr |
| `/developers/mcp` doc page | 1 hr |
| Sidebar nav entry + super-admin guard | 15 min |
| Add `mcp:read` scope to existing api-keys UI | 30 min |
| End-to-end testing in Claude Desktop | 1 hr |
| **Total** | **~half-day to full day** |

---

## Phase 2 — Polish & Power Features (Later)

Not blocking v1; revisit after we have real users.

- **MCP resources** (in addition to tools): expose entities/campaigns as MCP "resources" so Claude can browse them in the UI.
- **HTTP/SSE transport** at `/api/mcp` for web-based MCP clients.
- **Streaming search** for very large result sets.
- **Claude Skills publication**: package the MCP server as an installable Claude Skill so users get a one-click install instead of editing JSON config.
- **Per-call audit log** + admin dashboard tile showing top tokens by usage.
- **Custom prompts/instructions** ("System prompt: this is a campaign analyst's data, not raw inbox content...") to bias Claude toward domain-aware answers.
- **`mcp:read` rate limit bump** to 200-500/min once we have real-world usage data.

---

## Out of Scope (Forever or Long-Term)

- **Write tools.** No `create`, `update`, `delete`, `send` — ever, in v1, or in Phase 2. This is a hard line.
- **Subscriptions/notifications system inside RIP Tool.** Ryan's "notify me when Trump sends X" is a bot HE builds on top of MCP; we don't ship a notifications product. (If demand emerges later, consider it as a separate gameplan.)
- **Voice / multimodal MCP capabilities.** Not relevant.
- **Cross-client data leakage.** MCP keys inherit the same `clientId` scoping the REST API already enforces. A client's key only ever sees their own subscriptions/tags; CI data (campaigns, SMS, entities) is global as it is in the REST API today.

---

## Open Questions for Build Time

1. Do we want `mcp:read` as a distinct scope, or just default new keys to all read scopes? Recommend: keep distinct, but mark it as an MCP-specific scope in the UI.
2. Where does the MCP package live? Recommend: separate repo `kevinalyk/rip-mcp-server` for clean public-facing OSS optics. Could move to a monorepo `packages/` later if the boundary becomes annoying.
3. Should the doc page link to a published Claude/Cursor demo video? Recommend: yes, after first user (Ryan) produces one organically.
