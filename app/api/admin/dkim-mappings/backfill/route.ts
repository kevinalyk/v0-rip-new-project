import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { verifyAuth } from "@/lib/auth"

const prisma = new PrismaClient()

function parseDkimSelector(rawHeaders: string): string | null {
  // Match DKIM-Signature header and extract the s= value
  const match = rawHeaders.match(/DKIM-Signature:[^\n]*?\bs=([^;\s]+)/i)
  return match ? match[1].trim().toLowerCase() : null
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Load all mappings up front for lookup
    const mappings = await prisma.dkimSenderMapping.findMany()
    const mappingMap = new Map(mappings.map((m) => [m.selectorValue, m.friendlyName]))

    const BATCH_SIZE = 500
    let cursor: string | undefined = undefined
    let totalProcessed = 0
    let totalUpdated = 0

    while (true) {
      const records = await prisma.competitiveInsightCampaign.findMany({
        where: {
          rawHeaders: { not: null },
          isDeleted: false,
        },
        select: { id: true, rawHeaders: true },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: "asc" },
      })

      if (records.length === 0) break

      cursor = records[records.length - 1].id
      totalProcessed += records.length

      const updates = records
        .map((r) => {
          const selector = parseDkimSelector(r.rawHeaders!)
          const provider = selector ? (mappingMap.get(selector) ?? null) : null
          return { id: r.id, dkimSelector: selector, sendingProvider: provider }
        })
        .filter((u) => u.dkimSelector !== null)

      await Promise.all(
        updates.map((u) =>
          prisma.competitiveInsightCampaign.update({
            where: { id: u.id },
            data: { dkimSelector: u.dkimSelector, sendingProvider: u.sendingProvider },
          })
        )
      )

      totalUpdated += updates.length
    }

    return NextResponse.json({
      success: true,
      totalProcessed,
      totalUpdated,
      message: `Processed ${totalProcessed} records, updated ${totalUpdated} with a DKIM selector.`,
    })
  } catch (error) {
    console.error("Backfill error:", error)
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 })
  }
}
