# Inbox Analysis Features — Michael's Feedback (Apr 3)

Five new analysis features proposed for the Inbox/CI views. Each maps to existing
data we already collect — no new ingestion pipelines required, just new queries
and UI surfaces.

---

## #1 — Messaging Type Tagging

**What:** Tag every email and SMS with one or more message-type labels (urgency,
match, news-driven, personalization, survey, fundraising ask, etc.) and surface
counts + trend lines by type over time.

**Where it lives:** A new "Message Types" tab or section inside the existing
Competitive Insights analytics view (`components/ci-analytics-view.tsx`), or
as a dedicated sub-page under the CI section.

**How it works:**

Tags are derived by scanning the subject line, preview text, and message body for
signal patterns. This is classification logic, not a DB schema change for v1 — we
classify at query time and cache the results.

Classification rules (deterministic regex, not AI — fast and auditable):
- **Urgency** — "deadline", "expires", "hours left", "last chance", "running out"
- **Match** — "match", "matched", "double", "triple", "2x", "3x"
- **News-driven** — references to a named news event, bill name, or public figure
  (harder to automate; may start with a keyword list and expand)
- **Personalization** — `{{first_name}}` tokens, "Hi [Name]", "Fellow [State]"
  patterns in subject or body
- **Survey / poll** — "survey", "poll", "take our", "weigh in", "your input"
- **Fundraising ask** — explicit dollar amounts, "chip in", "donate", "contribute"

**Schema change:**
Add an optional `messageTypes String[]` (Postgres text array) column to
`CompetitiveInsightCampaign`. A backfill script classifies existing rows. Going
forward the ingest processor stamps it at insert time.

**Display:**
- Bar chart: volume by message type, stacked by party, filterable by date range
- Trend line: message type share over time (e.g. "match" emails are up 22% this month)
- Table: most recent examples per type, links to the full message

**Open questions:**
- Do we want AI-assisted classification (e.g. call an LLM for the "news-driven"
  category where regex is weak)? Cost is low per-message but adds latency to ingest.
  Recommended: regex for v1, optional LLM enrichment as a cron later.
- Should clients be able to define their own custom tags?

---

## #2 — Narrative and Topic Trends

**What:** Show the top keywords and fastest-growing topics in messages each week.
Provides context for volume spikes — "why did email volume double this week? Because
everyone was messaging about the budget vote."

**Where it lives:** New "Topics" section in the Trends report
(`app/[clientSlug]/reports/trends/page.tsx`), likely below the existing volume chart.

**How it works:**

Two complementary approaches:

**A. TF-IDF keyword extraction** (no external dependencies):
For each week, tokenize all subject lines + preview texts, strip stopwords, compute
term frequency × inverse document frequency across the corpus. Surface the top 20
terms by score. "Fastest growing" = compare this week's TF-IDF scores to last week's
and rank by delta.

**B. N-gram clustering** (phrases, not just single words):
Extract 2–3 word phrases (bigrams/trigrams) to catch "border security", "tax cut",
"matching gift" as single topics rather than fragmented single words.

This can run as a nightly aggregation cron that writes results to a new
`TopicTrendSnapshot { weekStart, term, count, delta, party? }` table. The UI then
reads from that table — no expensive real-time computation on page load.

**Display:**
- Top keywords this week (word cloud or ranked list with count badges)
- Fastest growing topics (ranked list with delta arrows: "budget +340%")
- Timeline: select a keyword, see its weekly volume over the past 90 days as a sparkline

**Open questions:**
- Scope to subject lines only (fast, lower noise) vs. full body text (richer, slower)?
  Recommended: subject + preview text for v1, full body opt-in later.
- Should keywords be scoped per-client (only messages their committee received) or
  across the full corpus? Both are useful — recommend "my inbox" as default, "all"
  as a toggle.

---

## #3 — Subject Line Patterns

**What:** Classify subject lines by structural pattern and surface aggregated stats
on how common each pattern is, how it trends, and how it correlates with inbox
placement.

**Where it lives:** New "Subject Lines" tab inside the CI analytics view, or a
dedicated section in the Trends report alongside #2.

**Patterns to detect** (deterministic, fast):
- **All caps** — entire subject is uppercase
- **All caps word(s)** — one or more ALL-CAPS words in an otherwise mixed-case subject
- **Question** — ends with `?`
- **Exclamation** — ends with `!`
- **Short** — under 30 characters
- **Long** — over 70 characters
- **Emoji present** — contains one or more Unicode emoji
- **Personalization token** — contains a merge tag (`{{`, `[Name]`, etc.)
- **Number / dollar amount** — contains `$X`, `Xx`, or a spelled-out match amount
- **Deadline / urgency word** — see #1 list

Classification is pure string logic — no ML needed. A single util function
`classifySubjectLine(subject: string): string[]` returns an array of matched
pattern labels.

**Schema change:**
Add `subjectPatterns String[]` to `CompetitiveInsightCampaign`, populated by the
same backfill + ingest-time logic as `messageTypes` above. Both columns can be
added in a single migration.

**Display:**
- Breakdown chart: % of messages using each pattern, by party and date range
- Correlation table: for each pattern, show average inbox rate, average spam rate.
  This is the most actionable insight — "question subject lines inbox 12% better."
- Examples panel: click a pattern to see the 10 most recent examples

**Open questions:**
- Do we want to cluster *similar* subject lines (e.g. all the "URGENT: X hours left"
  variants) to show how templates spread across campaigns? That's closer to feature
  #5 (message repetition) — could be unified.

---

## #4 — Competitive Comparisons

**What:** Side-by-side breakdown of top senders with their key behavioral metrics:
volume, channel mix (email vs SMS), send cadence, donation platform, inbox rate,
and subject line patterns. Essentially a leaderboard with expandable detail per
sender.

**Where it lives:** New "Comparisons" view, most naturally as a new page under the
CI section (`app/[clientSlug]/ci/comparisons/page.tsx`) or as a tab in the existing
CI analytics view.

**How it works:**

This is largely a re-aggregation of data we already have. The query:
- Groups `CompetitiveInsightCampaign` by assigned entity
- Computes per-entity: total emails, total SMS, email/SMS ratio, unique send dates
  (cadence proxy), average inbox rate, most-used donation platform, most-used
  subject pattern
- Returns top N entities sorted by total volume or inbox rate (user-selectable)

The API already does much of this for the leaderboard — we'd extend it with the
new pattern/type columns once #1 and #3 are built.

**Display:**
- Comparison table: one row per sender, columns for each metric, sortable
- Side-by-side modal or drawer: select two senders, see their metrics in a two-column
  layout with sparkline history for each
- "Strategy profile" chip row per sender: small badges for their dominant patterns
  (e.g. "Heavy match", "Emoji subject lines", "High SMS volume")

**Open questions:**
- Should clients only see entities in their CI feed, or should this be a cross-client
  aggregate? Current architecture is per-client — recommend keeping it scoped.
- Do we want a "compare my committee vs. top competitor" pre-built view?

---

## #5 — Message Repetition

**What:** Show what percentage of messages are exact duplicates or near-duplicates
(slightly modified templates). Surfaces how heavily campaigns recycle content and
helps identify "template families" — groups of messages that share a common ancestor.

**Where it lives:** New "Repetition" section in the CI analytics view or its own
page. Could also surface inline as a badge on individual messages ("Used 12 times").

**How it works:**

Two tiers of matching:

**Exact duplicates:**
We already have `rawSubject` and body content. Hash the normalized body (lowercase,
strip punctuation, strip merge tags) and group by hash. We essentially already do
this for dedup during ingest — the insight layer is just surfacing the stats
rather than hiding them.

**Near-duplicates (fuzzy matching):**
Use MinHash / Locality-Sensitive Hashing (LSH) on the body text to find messages
with >85% token overlap. This scales well — LSH runs in near-linear time against
a corpus. We'd compute MinHash signatures at ingest time, store them in a new
`bodyLshSignature Bytes` column, and cluster them in a nightly cron.

A simpler v1 shortcut: compare subject line edit distance (Levenshtein) across
messages from the same sender within a 30-day window. Catches "URGENT: donate now"
vs "URGENT: donate today" without full-body LSH.

**Schema change:**
- `bodyHash String?` — SHA-256 of the normalized body. Indexes exact dupes.
- `templateGroupId String?` — assigned by the nightly clustering cron. Null until
  first classification run. Messages in the same group share a common template.
- `bodyLshSignature Bytes?` — MinHash signature for near-dupe detection. Optional
  for v1 if we start with subject-line Levenshtein only.

**Display:**
- Summary stat: "X% of messages this month were recycled content" (exact + near-dupe)
- Template families: ranked list of template groups by usage count, showing the
  "original" (first seen) and all variants
- Per-sender repetition score: how often does each sender reuse content?
- Timeline: repetition rate over time — are campaigns getting lazier?

**Open questions:**
- What threshold counts as a "near-duplicate"? 85% token overlap is a reasonable
  starting point but should be tuneable.
- Should repeated messages from *different* senders count? That would surface
  coordinated messaging or shared template vendors — potentially very interesting.
  Recommend flagging this as a separate "coordinated messaging" signal rather than
  lumping it into repetition.

---

## Implementation Order (Recommended)

| Priority | Feature | Reason |
|----------|---------|--------|
| 1 | #3 Subject Line Patterns | Pure string logic, no schema migration needed for display. Most immediately actionable (inbox rate correlation). |
| 2 | #1 Messaging Type Tagging | Adds `messageTypes[]` column. Backfill + ingest hook. Powers #4. |
| 3 | #4 Competitive Comparisons | Mostly a UI re-aggregation of existing data. Becomes richer once #1/#3 land. |
| 4 | #2 Narrative / Topic Trends | Requires nightly aggregation cron + new snapshot table. Most infrastructure. |
| 5 | #5 Message Repetition | Requires `bodyHash` + optional LSH. Most complex but highest "wow factor." |

Features #1 and #3 share the same backfill script and schema migration and should
be built together in a single sprint.

---

## Shared Infrastructure Needed

- **`lib/message-classifier.ts`** — single util that takes a campaign record and
  returns `{ messageTypes: string[], subjectPatterns: string[] }`. Used by both
  the ingest processor and the backfill script. Powers #1 and #3.
- **Backfill script** — `scripts/backfill-message-classifications.ts`. Reads all
  existing `CompetitiveInsightCampaign` rows in batches, runs the classifier, and
  writes the two new columns. Idempotent.
- **`TopicTrendSnapshot` table** — for #2. Populated by a new
  `app/api/cron/compute-topic-trends/route.ts` that runs nightly.
- **New API routes** — each feature likely needs a dedicated endpoint under
  `app/api/ci/` (e.g. `app/api/ci/subject-patterns/`, `app/api/ci/topic-trends/`,
  `app/api/ci/comparisons/`, `app/api/ci/repetition/`) to keep query logic out of
  the component layer.
