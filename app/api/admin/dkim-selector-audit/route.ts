import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Aggregate all dkimSelector values with counts, including which ones already have a mapping
  const rows = await prisma.competitiveInsightCampaign.groupBy({
    by: ["dkimSelector"],
    _count: { dkimSelector: true },
    where: { dkimSelector: { not: null }, type: "email" },
    orderBy: { _count: { dkimSelector: "desc" } },
  })

  // Fetch existing mappings so we can mark which selectors are already mapped
  const existingMappings = await prisma.dkimSenderMapping.findMany({
    select: { selectorValue: true, friendlyName: true },
  })
  const mappedSelectors = new Map(
    existingMappings.map((m) => [m.selectorValue.toLowerCase(), m.friendlyName])
  )

  // Total email count for percentage calculation
  const totalEmails = rows.reduce((sum, r) => sum + r._count.dkimSelector, 0)

  const results = rows.map((r) => {
    const selector = r.dkimSelector as string
    return {
      selector,
      count: r._count.dkimSelector,
      percentage: totalEmails > 0 ? Math.round((r._count.dkimSelector / totalEmails) * 1000) / 10 : 0,
      mappedTo: mappedSelectors.get(selector.toLowerCase()) ?? null,
    }
  })

  return NextResponse.json({
    results,
    totalEmails,
    uniqueSelectors: results.length,
    unmappedCount: results.filter((r) => !r.mappedTo).length,
  })
}
