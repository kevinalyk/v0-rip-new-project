import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Parse every DKIM-Signature block from raw headers and return the s= selector values.
// Headers can be folded (continuation lines start with whitespace).
function extractDkimSelectors(rawHeaders: string): string[] {
  const selectors: string[] = []
  const dkimRegex = /DKIM-Signature:[^\n]*(?:\n[ \t][^\n]*)*/gi
  let match: RegExpExecArray | null
  while ((match = dkimRegex.exec(rawHeaders)) !== null) {
    const sMatch = /\bs=([^;\s]+)/i.exec(match[0])
    if (sMatch) selectors.push(sMatch[1].trim().toLowerCase())
  }
  return selectors
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Pull only the rawHeaders field for all non-deleted emails that have headers stored
  const campaigns = await prisma.competitiveInsightCampaign.findMany({
    where: { rawHeaders: { not: null }, isDeleted: false },
    select: { rawHeaders: true },
  })

  // Count occurrences of each unique s= selector value
  const selectorCounts = new Map<string, number>()
  for (const campaign of campaigns) {
    if (!campaign.rawHeaders) continue
    for (const selector of extractDkimSelectors(campaign.rawHeaders)) {
      selectorCounts.set(selector, (selectorCounts.get(selector) ?? 0) + 1)
    }
  }

  const totalEmails = campaigns.length

  // Check which selectors are already mapped in DkimSenderMapping
  const existingMappings = await prisma.dkimSenderMapping.findMany({
    select: { selectorValue: true, friendlyName: true },
  })
  const mappingLookup = new Map(
    existingMappings.map((m) => [m.selectorValue.toLowerCase(), m.friendlyName])
  )

  const results = Array.from(selectorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([selector, count]) => ({
      selector,
      count,
      percentage: totalEmails > 0 ? Math.round((count / totalEmails) * 1000) / 10 : 0,
      mappedTo: mappingLookup.get(selector) ?? null,
    }))

  return NextResponse.json({
    results,
    totalEmails,
    uniqueSelectors: results.length,
    unmappedCount: results.filter((r) => !r.mappedTo).length,
  })
}
