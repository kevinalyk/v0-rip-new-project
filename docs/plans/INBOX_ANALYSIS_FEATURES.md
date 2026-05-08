# Inbox Analysis Features — Michael's Feedback (Apr 3)

Five new analysis features proposed for the Inbox/CI views. Each maps to existing
data we already collect — no new ingestion pipelines required, just new queries,
classification logic, and UI surfaces.

**AI strategy summary:** Not all five features need AI equally. Two (#3 subject
line patterns, #4 competitive comparisons) are pure string/aggregation logic and
should stay that way — fast, deterministic, free. Three (#1 messaging type, #2
topic trends, #5 message repetition) either require AI or are substantially better
with it. Details per feature below.

**AI stack:** Groq (already integrated) for classification inference at ingest time.
OpenAI `text-embedding-3-small` via the Vercel AI Gateway for embeddings. Both
are called once per message at ingest and the result is stored — no re-processing
on page load, no per-query AI cost.

---

## #1 — Messaging Type Tagging

**What:** Tag every email and SMS with one or more message-type labels (urgency,
match, news-driven, personalization, survey, fundraising ask, etc.) and surface
counts + trend lines by type over time.

**Needs AI: Yes — LLM classifier at ingest time.**

Regex can catch obvious signals ("MATCH!" in subject = urgency, "$" = fundraising
ask) but fails on context. "We need you" is urgency or personalization depending
on tone. A small Groq inference call reading subject + body excerpt and returning
a JSON array of tags is far more reliable, costs fractions of a cent per message,
and runs once at ingest (result stored, never re-run). Regex can be used as a
cheap pre-filter to skip obvious cases before hitting the model.

**Classification targets:**
- **Urgency** — deadlines, countdown language, "last chance"
- **Match** — matching gift offers, double/triple
- **News-driven** — references a current event, bill, public figure action
- **Personalization** — merge tokens, "Hi [Name]", "Fellow [State]"
- **Survey / poll** — "weigh in", "take our poll", "your input"
- **Fundraising ask** — explicit dollar amounts, "chip in", "donate", "contribute"

**Schema change:**
Add `messageTypes String[]` (Postgres text array) to `CompetitiveInsightCampaign`.
A backfill cron classifies existing rows in batches via Groq. Going forward the
ingest processor stamps it at insert time. Both this column and `subjectPatterns`
(#3) land in a single migration.

**Display:**
- Bar chart: volume by message type, stacked by party, filterable by date range
- Trend line: message type share over time (e.g. "match emails up 22% this month")
- Table: most recent examples per type, links to full message

**Open questions:**
- Should clients be able to define custom tags beyond the default set?
- Backfill priority: most recent first (more useful) or oldest first (cheaper, avoids
  re-classifying stale data)?

---

## #2 — Narrative and Topic Trends

**What:** Top keywords each week and fastest-growing topics. Provides context for
volume spikes — "why did email volume double this week? Because everyone was
messaging about the budget vote."

**Needs AI: Partially — hybrid approach.**

TF-IDF is purely statistical and works well for raw keyword extraction (fast, free,
no external calls). But grouping keywords into coherent named topics ("immigration
rhetoric" vs. "border security" vs. "illegal aliens" being the same narrative
cluster) requires embeddings + clustering. Without AI, this is just a word cloud —
useful but not the "context behind spikes" that Michael described.

**Approach:**
- **Nightly TF-IDF batch** (no AI): tokenize all subject lines + preview texts,
  compute term frequency × inverse document frequency across the weekly corpus,
  surface top 20 terms and fastest-growing bigrams/trigrams. Written to a
  `TopicTrendSnapshot` table. UI reads from the snapshot — no real-time computation.
- **Weekly AI clustering pass** (Groq): take the top 50 raw keywords from the
  week and ask the model to group them into 5–10 named topic clusters. Runs once
  per week, stores cluster assignments alongside the keyword data.

**Display:**
- Top keywords this week (ranked list with count badges)
- Fastest growing topics (ranked list with delta arrows: "budget +340%")
- Timeline: click a keyword/topic, see its weekly volume over the past 90 days

**Open questions:**
- Scope to subject lines only (lower noise) vs. full body text (richer)?
  Recommended: subject + preview text for v1.
- "My inbox" (client-scoped) vs. full corpus? Recommend client-scoped as default
  with an "all" toggle.

---

## #3 — Subject Line Patterns

**What:** Classify subject lines by structural pattern and surface stats on how
common each pattern is, how it trends, and how it correlates with inbox placement.

**Needs AI: No — pure string logic, deterministic and fast.**

Every pattern here is unambiguous and can be detected with a single regex or
string check. AI would add latency and cost with zero accuracy benefit. This is
the feature you can build fastest with the highest confidence in the output.

**Patterns to detect:**
- **All caps** — entire subject is uppercase
- **All caps word(s)** — one or more ALL-CAPS words in mixed-case subject
- **Question** — ends with `?`
- **Exclamation** — ends with `!`
- **Short** — under 30 characters
- **Long** — over 70 characters
- **Emoji present** — contains one or more Unicode emoji
- **Personalization token** — contains `{{`, `[Name]`, or similar merge tag
- **Number / dollar amount** — contains `$X`, `Xx`, or spelled-out match amount
- **Deadline / urgency word** — "deadline", "expires", "hours left", "last chance"

A single `classifySubjectLine(subject: string): string[]` util function handles
all patterns. Used at ingest time and in the backfill script.

**Schema change:**
Add `subjectPatterns String[]` to `CompetitiveInsightCampaign`. Same migration
as `messageTypes` (#1) above — both columns in one go, one backfill script.

**Display:**
- Breakdown chart: % of messages using each pattern, by party and date range
- Correlation table: for each pattern, average inbox rate vs. spam rate — the most
  actionable output ("question subject lines inbox 12% better")
- Examples panel: click any pattern to see the 10 most recent examples

---

## #4 — Competitive Comparisons

**What:** Side-by-side breakdown of top senders with key behavioral metrics:
volume, channel mix, send cadence, donation platform, inbox rate, and subject
line patterns.

**Needs AI: No — aggregation of data we already have.**

Once #1 and #3 are built and messages are tagged, competitive comparisons are
purely a grouping + counting exercise. The existing leaderboard API already does
much of this — we extend it with the new classification columns. No model calls
needed at any point.

**How it works:**
- Groups `CompetitiveInsightCampaign` by assigned entity
- Per entity: total emails, total SMS, email/SMS ratio, send dates (cadence proxy),
  average inbox rate, most-used donation platform, most-used subject patterns,
  most-used message types
- Returns top N entities sorted by total volume or inbox rate (user-selectable)

**Display:**
- Comparison table: one row per sender, all metric columns, sortable
- Side-by-side detail: select two senders, see metrics in a two-column layout
  with sparkline history for each
- "Strategy profile" chips per sender: dominant pattern badges (e.g. "Heavy match",
  "Emoji subject lines", "High SMS volume")

**Open questions:**
- Should this be scoped to the client's own CI feed or across the full corpus?
  Recommend client-scoped as default, consistent with the rest of CI.

---

## #5 — Message Repetition

**What:** Show what percentage of messages are exact or near-duplicates. Surfaces
how heavily campaigns recycle content and identifies "template families" — groups
of messages sharing a common ancestor.

**Needs AI: Yes — embeddings for near-duplicate detection.**

Exact duplicates are trivial: hash the normalized body and group by hash. No AI
needed. Near-duplicates (slightly reworded templates — "URGENT: donate now" vs.
"URGENT: donate today") require text embeddings to compute semantic similarity.
Levenshtein distance on subject lines is a usable v1 approximation for same-sender
detection but breaks down cross-sender and misses body-level reuse.

**Approach:**
- **Exact dupes** (no AI): SHA-256 hash of the normalized body (lowercase, strip
  punctuation, strip merge tags). Store as `bodyHash String?`. Group by hash to
  find exact copies.
- **Near-dupes** (embeddings): Generate `text-embedding-3-small` vector for each
  message body once at ingest. Store as `bodyEmbedding` (pgvector). A nightly cron
  clusters messages with cosine similarity > 0.92 and assigns them a shared
  `templateGroupId String?`. Cross-sender clustering is deliberately included —
  it surfaces coordinated messaging and shared template vendors, which is its own
  high-value signal.
- **V1 shortcut** if pgvector is not yet available: Levenshtein on subject lines
  within a 30-day same-sender window. Ships faster, catches ~60% of near-dupes.

**Schema change:**
- `bodyHash String?` — indexes exact dupes
- `templateGroupId String?` — assigned by nightly clustering cron
- `bodyEmbedding Unsupported("vector(1536)")?` — requires pgvector extension
  (available on Neon by default)

**Display:**
- Summary stat: "X% of messages this month were recycled content"
- Template families: ranked list of groups by usage count, showing the original
  (first seen) and all variants with sender + date
- Per-sender repetition score: how often each sender reuses content
- Timeline: repetition rate over time

**Open questions:**
- 0.92 cosine similarity as the near-dupe threshold is a starting point — should
  be tunable per client.
- Cross-sender "coordinated messaging" is interesting enough to surface as its own
  separate signal rather than just folding it into repetition stats.

---

## Implementation Order (Recommended)

| Priority | Feature | AI needed | Reason |
|----------|---------|-----------|--------|
| 1 | #3 Subject Line Patterns | No | Pure string logic, ships fast, highest confidence output. Most immediately actionable (inbox rate correlation). |
| 2 | #1 Messaging Type Tagging | Yes — Groq classifier at ingest | Adds `messageTypes[]` + `subjectPatterns[]` in a single migration. Powers #4. |
| 3 | #4 Competitive Comparisons | No | UI re-aggregation. Becomes genuinely rich once #1/#3 data is backfilled. |
| 4 | #2 Narrative / Topic Trends | Partially — TF-IDF + weekly Groq clustering | New snapshot table + nightly cron. Most infrastructure work. |
| 5 | #5 Message Repetition | Yes — embeddings + nightly cluster cron | Most complex. Highest "wow factor." Requires pgvector. |

Features #1 and #3 share a single migration and a single backfill script and
should be built together in the same sprint.

---

## Daily AI Report — $300 Tier

Rather than surfacing all five features as separate standalone views, the primary
delivery mechanism for AI-powered analysis on the $300 tier is a **daily
pre-generated briefing** — a structured analyst-style report written by AI from
the previous 24–48 hours of data, regenerated once per day at 6 AM ET.

**Why once a day:**
- AI cost is fixed and predictable — one model call per client per day regardless
  of how many times they view the report
- Clients get a consistent "morning briefing" rhythm rather than a live dashboard
  they have to check constantly
- The report is stored as a DB row — every page load is a fast DB read, no model
  call on demand

**What the report covers:**
A single report can roll up several of Michael's requested features in one pass:
- Top messaging themes and fastest-growing topics (#2 narrative trends)
- Subject line tactics in play this week (#3 patterns)
- Competitive sender breakdown — who's sending what, channel mix, volume (#4)
- Messaging type shift vs. prior week (#1 tagging)

This is a "what's happening in the inbox right now" briefing — AI-written prose
with key stats inline, structured as sections. Not a dashboard, more like an
analyst memo that refreshes each morning.

**Cost model:**
Feeding a summary of the top 200 messages (subject lines + sender + type tags,
not full bodies) is ~8–10k tokens per client per day. At Groq or GPT-4o-mini
pricing that is fractions of a penny — well under $1/month per client. Richer
analysis with full body text scales cost up but remains manageable. The report
runs on the house — it is included in the $300 tier at no variable cost to the
client and no meaningful cost to us.

**On-demand regeneration — Stripe billing (future):**
Stripe is adding native AI token billing, which opens a clean path for charging
clients to regenerate the report mid-day if they want a fresh read. The default
(once daily, free to view) stays on the house. A client who wants a second run
at 2 PM can pay a small per-report fee directly charged through Stripe at the
moment they click "Regenerate." No subscription tier change needed — it is a
pure usage charge. This is not v1 scope but the architecture should not block it:
keep the generation logic in a single callable function so both the cron and a
future paid endpoint can invoke it.

**Tier gating:**
The report page checks `client.tier === 'pro'` (or equivalent $300 tier flag)
before rendering. Non-pro clients see a paywall prompt. Historical reports (last
30 days) are stored so clients can browse past briefings — this is a feature in
itself.

**Schema:**
New `DailyReport` table:
```
model DailyReport {
  id          String   @id @default(cuid())
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  generatedAt DateTime @default(now())
  reportDate  String   // "YYYY-MM-DD" — the day this report covers
  content     Json     // structured sections: { summary, themes, subjectPatterns, senders, ... }
  model       String   // which model generated it, for debugging/audit
  promptTokens  Int?
  outputTokens  Int?
  createdAt   DateTime @default(now())

  @@unique([clientId, reportDate])
}
```

**Cron:** `app/api/cron/generate-daily-reports/route.ts`, scheduled 10:00 UTC
(6 AM ET). Iterates clients with `tier === 'pro'`, generates one report each,
upserts into `DailyReport` by `(clientId, reportDate)` — safe to re-run.

---

## Shared Infrastructure Needed

- **`lib/message-classifier.ts`** — util that takes a campaign record and returns
  `{ messageTypes: string[], subjectPatterns: string[] }`. The `subjectPatterns`
  half is pure string logic; `messageTypes` calls Groq when the pre-filter regex
  is inconclusive. Used by both the ingest processor and the backfill script.
- **Backfill script** — `scripts/backfill-message-classifications.ts`. Reads all
  existing `CompetitiveInsightCampaign` rows in batches of 50, runs the classifier
  (with Groq rate-limit awareness), writes `messageTypes` + `subjectPatterns`.
  Idempotent — skips rows where both columns are already populated.
- **`TopicTrendSnapshot` table** — for #2. Populated by
  `app/api/cron/compute-topic-trends/route.ts` running nightly.
- **pgvector extension** — for #5. Already available on Neon, just needs to be
  enabled and the `bodyEmbedding` column added.
- **New API routes** — one per feature under `app/api/ci/`:
  - `app/api/ci/subject-patterns/`
  - `app/api/ci/message-types/`
  - `app/api/ci/topic-trends/`
  - `app/api/ci/comparisons/`
  - `app/api/ci/repetition/`
