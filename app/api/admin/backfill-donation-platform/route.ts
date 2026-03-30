import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth"

// Platform detection rules — ORDER MATTERS.
// PSQ must come before WinRed because PSQ emails frequently contain
// WinRed store/merch links that are NOT donation links.
const PLATFORM_RULES: Array<{ platform: string; domains: string[] }> = [
  { platform: "psq",     domains: ["psqimpact.com", "politicalsurveyquestions.com", "psqsurveys.com"] },
  { platform: "actblue", domains: ["actblue.com"] },
  { platform: "anedot",  domains: ["anedot.com"] },
  { platform: "winred",  domains: ["winred.com"] },
]

function detectPlatform(ctaLinks: unknown): string | null {
  let links: unknown[] = []
  if (Array.isArray(ctaLinks)) {
    links = ctaLinks
  } else if (typeof ctaLinks === "string") {
    try { links = JSON.parse(ctaLinks) } catch { return null }
  } else {
    return null
  }

  const urls = links.map((link) => {
    if (typeof link === "string") return link.toLowerCase()
    const l = link as Record<string, unknown>
    return ((l.finalUrl ?? l.url ?? "") as string).toLowerCase()
  })

  for (const rule of PLATFORM_RULES) {
    if (urls.some((url) => rule.domains.some((d) => url.includes(d)))) {
      return rule.platform
    }
  }
  return null
}

export async function POST(request: Request) {
  const authResult = await requireSuperAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json().catch(() => ({}))
    const dryRun: boolean = body.dryRun === true
    const batchSize = 500

    let cursor: string | null = null
    const summary = {
      processed: 0,
      updated: 0,
      alreadySet: 0,
      noMatch: 0,
      byPlatform: { winred: 0, actblue: 0, anedot: 0, psq: 0 } as Record<string, number>,
    }
    const samples: Array<{ id: string; subject: string; platform: string }> = []

    // Process in batches to avoid memory issues with large tables
    while (true) {
      const campaigns = await prisma.competitiveInsightCampaign.findMany({
        where: {
          isDeleted: false,
          ...(cursor ? { id: { gt: cursor } } : {}),
        },
        select: { id: true, subject: true, ctaLinks: true, donationPlatform: true },
        orderBy: { id: "asc" },
        take: batchSize,
      })

      if (campaigns.length === 0) break

      const updates: Array<{ id: string; platform: string }> = []

      for (const campaign of campaigns) {
        summary.processed++

        if (campaign.donationPlatform) {
          summary.alreadySet++
          continue
        }

        const platform = detectPlatform(campaign.ctaLinks)
        if (!platform) {
          summary.noMatch++
          continue
        }

        updates.push({ id: campaign.id, platform })
        summary.updated++
        summary.byPlatform[platform] = (summary.byPlatform[platform] ?? 0) + 1

        if (samples.length < 20) {
          samples.push({ id: campaign.id, subject: campaign.subject, platform })
        }
      }

      // Apply updates in one transaction per batch
      if (!dryRun && updates.length > 0) {
        await prisma.$transaction(
          updates.map(({ id, platform }) =>
            prisma.competitiveInsightCampaign.update({
              where: { id },
              data: { donationPlatform: platform },
            })
          )
        )
      }

      cursor = campaigns[campaigns.length - 1].id

      // Stop if we got fewer than batchSize (last page)
      if (campaigns.length < batchSize) break
    }

    return NextResponse.json({ dryRun, summary, samples })
  } catch (error) {
    console.error("[backfill-donation-platform] error:", error)
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 })
  }
}
