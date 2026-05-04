import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { del } from "@vercel/blob"
import prisma from "@/lib/prisma"
import { PLACEHOLDER_IMAGE_HASHES, sha256Hex } from "@/lib/ballotpedia-enrich"

export const runtime = "nodejs"
// Each entity = 1 HTTPS fetch from Blob (small image, ~100KB) + hash + maybe
// a delete. ~1s per entity worst case. Cap at 250 per call so we comfortably
// fit in the Pro 300s timeout. Caller can re-run until processed=0.
export const maxDuration = 300

const DEFAULT_BATCH_SIZE = 250
const MAX_BATCH_SIZE = 500

// One-shot (re-runnable) cleanup that scans entities whose imageUrl was
// scraped from Ballotpedia, hashes the stored Blob, and clears any that turn
// out to be the "Submit a photo" / BP initials placeholder. Used to fix the
// historical mess from before placeholder detection was added to the enrich
// path; the weekly refresh cron then naturally retries those entities.
//
// Trigger manually via either:
//   curl "https://app.rip-tool.com/api/cron/cleanup-placeholder-images?secret=$CRON_SECRET&limit=250"
// or paste the URL directly into a browser. Re-run until {processed: 0}
// comes back. Idempotent — once an entity has been moved to
// imageUrlSource='ballotpedia-placeholder' it falls out of the scan query.
export async function GET(request: NextRequest) {
  // Allow Vercel Cron OR a `?secret=` query param (mirrors other crons).
  const userAgent = request.headers.get("user-agent") || ""
  const isVercelCron = userAgent.includes("vercel-cron")
  const { searchParams } = new URL(request.url)

  if (!isVercelCron) {
    const cronSecret = searchParams.get("secret")
    if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_BATCH_SIZE), 10) || DEFAULT_BATCH_SIZE),
    MAX_BATCH_SIZE,
  )
  // dryRun=1 just reports what WOULD be cleared without touching anything.
  const dryRun = searchParams.get("dryRun") === "1"

  const startedAt = Date.now()
  const summary = {
    scanned: 0,
    placeholdersFound: 0,
    cleared: 0,
    fetchErrors: 0,
    blobDeleteErrors: 0,
    examples: [] as { entityId: string; name: string; hash: string; imageUrl: string }[],
  }

  // Scan entities that still claim a 'ballotpedia' source — those are the
  // only ones that could be hiding a placeholder under the old behavior.
  // 'manual' is sacred. 'ballotpedia-placeholder' is already correct.
  const entities = await prisma.ciEntity.findMany({
    where: {
      imageUrl: { not: null },
      imageUrlSource: "ballotpedia",
    },
    take: limit,
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, imageUrl: true },
  })

  console.log(`[cron:cleanup-placeholders] Scanning ${entities.length} entities (dryRun=${dryRun})`)

  for (const entity of entities) {
    if (!entity.imageUrl) continue
    summary.scanned++

    let hash: string
    try {
      const res = await fetch(entity.imageUrl, { cache: "no-store" })
      if (!res.ok) {
        summary.fetchErrors++
        continue
      }
      const buf = await res.arrayBuffer()
      hash = sha256Hex(buf)
    } catch (err) {
      summary.fetchErrors++
      console.error(`[cron:cleanup-placeholders] Failed to fetch ${entity.imageUrl}:`, err)
      continue
    }

    if (!PLACEHOLDER_IMAGE_HASHES.has(hash)) continue

    summary.placeholdersFound++
    if (summary.examples.length < 10) {
      summary.examples.push({
        entityId: entity.id,
        name: entity.name,
        hash,
        imageUrl: entity.imageUrl,
      })
    }

    if (dryRun) continue

    // Real cleanup: clear the DB row first (so even if the Blob delete fails
    // we never end up pointing at a deleted Blob), then delete the Blob.
    try {
      await prisma.ciEntity.update({
        where: { id: entity.id },
        data: {
          imageUrl: null,
          imageUrlSource: "ballotpedia-placeholder",
        },
      })
      try {
        await del(entity.imageUrl)
      } catch (err) {
        summary.blobDeleteErrors++
        console.error(`[cron:cleanup-placeholders] Failed to delete Blob ${entity.imageUrl}:`, err)
      }
      summary.cleared++
    } catch (err) {
      console.error(`[cron:cleanup-placeholders] Failed to update entity ${entity.id}:`, err)
    }
  }

  const durationMs = Date.now() - startedAt
  console.log(`[cron:cleanup-placeholders] Done in ${durationMs}ms`, summary)

  return NextResponse.json({
    ok: true,
    dryRun,
    durationMs,
    ...summary,
  })
}
