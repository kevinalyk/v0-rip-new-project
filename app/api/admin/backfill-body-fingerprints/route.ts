import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import { computeBodyFingerprint } from "@/lib/body-fingerprint"

/**
 * One-time backfill: compute bodyFingerprint for all existing campaigns that have
 * emailContent but no fingerprint yet.
 *
 * Hit POST /api/admin/backfill-body-fingerprints (super_admin only).
 * Safe to run multiple times — only processes rows where bodyFingerprint IS NULL.
 */
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await prisma.competitiveInsightCampaign.findMany({
    where: {
      emailContent: { not: null },
      bodyFingerprint: null,
    },
    select: { id: true, emailContent: true },
  })

  let processed = 0
  let skipped = 0
  const BATCH = 50

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)

    await Promise.all(
      batch.map(async (row) => {
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
  }

  return NextResponse.json({
    ok: true,
    total: rows.length,
    processed,
    skipped,
    message: `Backfill complete. ${processed} fingerprints written, ${skipped} skipped (no usable content).`,
  })
}
