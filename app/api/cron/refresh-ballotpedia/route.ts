import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import prisma from "@/lib/prisma"
import { enrichEntityFromBallotpedia } from "@/lib/ballotpedia-enrich"

export const runtime = "nodejs"
// 100 entities × ~2s avg per scrape (fetch + parse + maybe image upload) +
// 500ms politeness delay = ~250s worst case. Cap at the Pro plan max (300s).
export const maxDuration = 300

const JOB_NAME = "ballotpedia-refresh"
// How many entities to process per daily run. With ~700 entities that have a
// ballotpediaUrl, this gives a ~7 day rotation. Tune up or down here.
const BATCH_SIZE = 100
// Delay between requests to avoid hammering Ballotpedia. They're a non-profit
// and we don't want to look like a scraper bot.
const DELAY_MS = 500

// Refreshes Ballotpedia data for the BATCH_SIZE entities whose data is
// stalest (oldest ballotpediaFetchedAt, with NULLs first so newly-linked
// entities get processed before re-runs). Always refreshes bio + office.
//
// Image-refresh logic:
//   - imageUrlSource = 'manual'                → SKIP image (admin uploaded)
//   - imageUrlSource = 'ballotpedia'           → SKIP image (real photo, locked)
//   - imageUrlSource = 'ballotpedia-placeholder' → fetch + hash; replace if real
//   - imageUrlSource = NULL                    → fetch + hash; store if real
// The hash check happens inside enrichEntityFromBallotpedia, which compares
// fetched bytes against PLACEHOLDER_IMAGE_HASHES. When a placeholder is
// detected, we flag the entity so future runs keep retrying.
//
// Designed to be idempotent + safe to re-run: each successful processing
// stamps ballotpediaFetchedAt to NOW(), naturally rotating the entity to
// the back of the queue. Failures also stamp the timestamp (via the enrich
// lib's touchTimestampOnFailure flag) so a permanently broken URL doesn't
// camp at the front forever.
export async function GET(request: NextRequest) {
  // Allow this route in two ways (mirrors scrape-fec-launches):
  // 1. Vercel Cron — identified by the `vercel-cron/1.0` user agent (auto-set)
  // 2. Manual trigger — pass `?secret=<CRON_SECRET>` (only if CRON_SECRET is set)
  const userAgent = request.headers.get("user-agent") || ""
  const isVercelCron = userAgent.includes("vercel-cron")

  if (!isVercelCron) {
    const { searchParams } = new URL(request.url)
    const cronSecret = searchParams.get("secret")
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const startedAt = Date.now()
  const summary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    imageRefreshed: 0,
    imageSkippedManual: 0,
    imageSkippedLocked: 0,
    errors: [] as { entityId: string; name: string; error: string }[],
  }

  const entities = await prisma.ciEntity.findMany({
    where: { ballotpediaUrl: { not: null } },
    orderBy: [{ ballotpediaFetchedAt: { sort: "asc", nulls: "first" } }],
    take: BATCH_SIZE,
    select: {
      id: true,
      name: true,
      ballotpediaUrl: true,
      imageUrlSource: true,
    },
  })

  console.log(`[cron:ballotpedia-refresh] Processing ${entities.length} entities`)

  for (const entity of entities) {
    if (!entity.ballotpediaUrl) continue
    summary.processed++

    // Skip image fetch when the entity has either a manually-uploaded photo
    // OR a real Ballotpedia photo we've already locked. Only NULL and
    // 'ballotpedia-placeholder' sources fall through to the image fetch path.
    const skipImage =
      entity.imageUrlSource === "manual" || entity.imageUrlSource === "ballotpedia"
    if (entity.imageUrlSource === "manual") summary.imageSkippedManual++
    else if (entity.imageUrlSource === "ballotpedia") summary.imageSkippedLocked++

    try {
      const result = await enrichEntityFromBallotpedia(entity.id, entity.ballotpediaUrl, {
        skipImage,
        touchTimestampOnFailure: true,
      })

      if (result.success) {
        summary.succeeded++
        if (result.imageUrl) summary.imageRefreshed++
      } else {
        summary.failed++
        summary.errors.push({
          entityId: entity.id,
          name: entity.name,
          error: result.error || `status ${result.status}`,
        })
      }
    } catch (err) {
      summary.failed++
      const message = err instanceof Error ? err.message : String(err)
      summary.errors.push({ entityId: entity.id, name: entity.name, error: message })
      console.error(`[cron:ballotpedia-refresh] ${entity.name} (${entity.id}) threw:`, err)
    }

    // Be polite to Ballotpedia
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }

  // Track last run for observability. Idempotent — the SQL migration seeds
  // this row, but upsert covers the case where someone runs this in a new
  // environment without seeding first.
  await prisma.cronJobState.upsert({
    where: { jobName: JOB_NAME },
    update: { lastRunAt: new Date() },
    create: { jobName: JOB_NAME, lastRunAt: new Date() },
  })

  const durationMs = Date.now() - startedAt
  console.log(`[cron:ballotpedia-refresh] Done in ${durationMs}ms`, {
    processed: summary.processed,
    succeeded: summary.succeeded,
    failed: summary.failed,
    imageRefreshed: summary.imageRefreshed,
    imageSkippedManual: summary.imageSkippedManual,
    imageSkippedLocked: summary.imageSkippedLocked,
  })

  // Trim the error payload so we don't return a 50KB JSON blob on a bad day.
  return NextResponse.json({
    ok: true,
    durationMs,
    ...summary,
    errors: summary.errors.slice(0, 25),
    truncatedErrors: Math.max(0, summary.errors.length - 25),
  })
}
