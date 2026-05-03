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
// When true, images are refreshed for entities with imageUrlSource !== 'manual'.
// Currently false — see header comment. Bio + office always refresh.
const REFRESH_IMAGES = false

// Refreshes Ballotpedia data for the BATCH_SIZE entities whose data is
// stalest (oldest ballotpediaFetchedAt, with NULLs first so newly-linked
// entities get processed before re-runs). Always refreshes bio + office.
//
// IMAGES ARE SKIPPED FOR EVERY ENTITY in this cron — see REFRESH_IMAGES
// below. The image refresh path is functional in lib/ballotpedia-enrich.ts
// (and the manual-vs-ballotpedia source tracking is in place) but we leave
// images alone here until the placeholder-detection problem is solved.
// Otherwise this cron would re-pull "Submit a photo" placeholders weekly
// for entities that have one, and burn Blob storage re-uploading identical
// headshots for everyone else. Flip REFRESH_IMAGES to true once that's
// sorted; the manual-source skip logic will then kick in automatically.
//
// Designed to be idempotent + safe to re-run: each successful processing
// stamps ballotpediaFetchedAt to NOW(), naturally rotating the entity to
// the back of the queue. Failures also stamp the timestamp (via the enrich
// lib's touchTimestampOnFailure flag) so a permanently broken URL doesn't
// camp at the front forever.
export async function GET(request: NextRequest) {
  // Cron secret check — same pattern as scrape-fec-launches and other crons.
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const authHeader = request.headers.get("authorization")
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const startedAt = Date.now()
  const summary = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    imageRefreshed: 0,
    imageSkippedManual: 0,
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

    // Skip images entirely while REFRESH_IMAGES is off; otherwise skip only
    // entities with manually-curated photos.
    const skipImage = !REFRESH_IMAGES || entity.imageUrlSource === "manual"
    if (REFRESH_IMAGES && entity.imageUrlSource === "manual") summary.imageSkippedManual++

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
