import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { extractSendingIp } from "@/lib/ip-sender-utils"

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
