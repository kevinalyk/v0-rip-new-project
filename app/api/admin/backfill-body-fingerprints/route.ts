import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import { computeBodyFingerprint } from "@/lib/body-fingerprint"

/**
 * Paginated backfill: compute bodyFingerprint for campaigns that have emailContent but no fingerprint.
 * Call repeatedly with increasing offset until hasMore = false.
 *
 * GET  /api/admin/backfill-body-fingerprints          — returns total pending count
 * POST /api/admin/backfill-body-fingerprints?offset=0&batchSize=500
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const total = await prisma.competitiveInsightCampaign.count({
    where: { emailContent: { not: null }, bodyFingerprint: null },
  })

  return NextResponse.json({ total })
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)
  const batchSize = Math.min(parseInt(searchParams.get("batchSize") ?? "500", 10), 1000)

  const rows = await prisma.competitiveInsightCampaign.findMany({
    where: { emailContent: { not: null }, bodyFingerprint: null },
    select: { id: true, emailContent: true },
    orderBy: { createdAt: "asc" },
    skip: offset,
    take: batchSize,
  })

  let processed = 0
  let skipped = 0

  await Promise.all(
    rows.map(async (row) => {
      const fp = computeBodyFingerprint(row.emailContent ?? "")
      if (fp === "[]") {
        skipped++
        return
      }
      await prisma.competitiveInsightCampaign.update({
        where: { id: row.id },
        data: { bodyFingerprint: fp },
      })
      processed++
    }),
  )

  // Count remaining after this batch
  const remaining = await prisma.competitiveInsightCampaign.count({
    where: { emailContent: { not: null }, bodyFingerprint: null },
  })

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    remaining,
    hasMore: remaining > 0,
  })
}
