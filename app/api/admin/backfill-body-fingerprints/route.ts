import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"
import { computeBodyFingerprint, computeSmsFingerprint } from "@/lib/body-fingerprint"

/**
 * Paginated backfill: compute bodyFingerprint for email campaigns and SMS messages.
 * Call repeatedly with increasing offset until hasMore = false.
 *
 * GET  /api/admin/backfill-body-fingerprints               — returns pending counts for both
 * POST /api/admin/backfill-body-fingerprints?offset=0&batchSize=500&target=email|sms
 */
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [emailTotal, smsTotal] = await Promise.all([
    prisma.competitiveInsightCampaign.count({
      where: { emailContent: { not: null }, bodyFingerprint: null },
    }),
    prisma.smsQueue.count({
      where: { message: { not: null }, bodyFingerprint: null },
    }),
  ])

  return NextResponse.json({ total: emailTotal + smsTotal, emailTotal, smsTotal })
}

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request)
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)
  const batchSize = Math.min(parseInt(searchParams.get("batchSize") ?? "500", 10), 1000)
  const target = searchParams.get("target") ?? "email" // "email" | "sms"

  let processed = 0
  let skipped = 0
  let remaining = 0

  if (target === "sms") {
    const rows = await prisma.smsQueue.findMany({
      where: { message: { not: null }, bodyFingerprint: null },
      select: { id: true, message: true },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: batchSize,
    })

    await Promise.all(
      rows.map(async (row) => {
        const fp = computeSmsFingerprint(row.message ?? "")
        if (fp === "[]") {
          skipped++
          return
        }
        await prisma.smsQueue.update({
          where: { id: row.id },
          data: { bodyFingerprint: fp },
        })
        processed++
      }),
    )

    remaining = await prisma.smsQueue.count({
      where: { message: { not: null }, bodyFingerprint: null },
    })
  } else {
    const rows = await prisma.competitiveInsightCampaign.findMany({
      where: { emailContent: { not: null }, bodyFingerprint: null },
      select: { id: true, emailContent: true },
      orderBy: { createdAt: "asc" },
      skip: offset,
      take: batchSize,
    })

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

    remaining = await prisma.competitiveInsightCampaign.count({
      where: { emailContent: { not: null }, bodyFingerprint: null },
    })
  }

  return NextResponse.json({
    ok: true,
    target,
    processed,
    skipped,
    remaining,
    hasMore: remaining > 0,
  })
}
