import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Extract the sending IP from Received-SPF or Authentication-Results headers.
// Prefers client-ip= (Received-SPF), falls back to sender IP in Authentication-Results.
function extractSendingIp(rawHeaders: string): string | null {
  // Received-SPF: pass (... client-ip=1.2.3.4; ...)
  const spfMatch = /client-ip=([\d.]+)/i.exec(rawHeaders)
  if (spfMatch) return spfMatch[1]

  // Authentication-Results: ... sender IP is 1.2.3.4
  const authMatch = /sender IP is ([\d.]+)/i.exec(rawHeaders)
  if (authMatch) return authMatch[1]

  // Received: from hostname ([1.2.3.4]) — first external hop
  const receivedMatch = /Received: from [^\n]*\[([\d.]+)\]/i.exec(rawHeaders)
  if (receivedMatch) return receivedMatch[1]

  return null
}

export async function GET(request: NextRequest) {
  const user = await getCurrentUser(request)
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Pull rawHeaders for all non-deleted emails that have headers stored
  const campaigns = await prisma.competitiveInsightCampaign.findMany({
    where: { rawHeaders: { not: null }, isDeleted: false },
    select: { rawHeaders: true },
  })

  // Count occurrences of each unique sending IP
  const ipCounts = new Map<string, number>()
  let noIpCount = 0

  for (const campaign of campaigns) {
    if (!campaign.rawHeaders) continue
    const ip = extractSendingIp(campaign.rawHeaders)
    if (ip) {
      ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1)
    } else {
      noIpCount++
    }
  }

  const totalEmails = campaigns.length
  const totalWithIp = totalEmails - noIpCount

  const results = Array.from(ipCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([ip, count]) => ({
      ip,
      count,
      percentage: totalEmails > 0 ? Math.round((count / totalEmails) * 1000) / 10 : 0,
    }))

  return NextResponse.json({
    results,
    totalEmails,
    totalWithIp,
    uniqueIps: results.length,
    noIpCount,
  })
}
