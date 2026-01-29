import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Starting platform analysis...")

    const emailCampaigns = await sql`
      SELECT "ctaLinks"
      FROM "CompetitiveInsightCampaign"
      WHERE "ctaLinks" IS NOT NULL 
        AND "isDeleted" = false
    `

    const smsMessages = await sql`
      SELECT "ctaLinks"
      FROM "SmsQueue"
      WHERE "ctaLinks" IS NOT NULL
        AND processed = true
        AND "isDeleted" = false
    `

    console.log(`[v0] Found ${emailCampaigns.length} emails and ${smsMessages.length} SMS with links`)

    if (emailCampaigns.length > 0) {
      const sample = emailCampaigns[0].ctaLinks
      console.log("[v0] Sample email ctaLinks type:", typeof sample)
      console.log("[v0] Sample email ctaLinks value:", JSON.stringify(sample))
      console.log("[v0] Sample email ctaLinks is array:", Array.isArray(sample))
    }

    if (smsMessages.length > 0) {
      const sample = smsMessages[0].ctaLinks
      console.log("[v0] Sample SMS ctaLinks type:", typeof sample)
      console.log("[v0] Sample SMS ctaLinks value:", JSON.stringify(sample))
      console.log("[v0] Sample SMS ctaLinks is array:", Array.isArray(sample))
    }

    const domainCounts: Record<string, number> = {}

    // Helper function to extract domain from URL
    const extractDomain = (url: string): string | null => {
      try {
        const urlObj = new URL(url)
        return urlObj.hostname.toLowerCase()
      } catch {
        const match = url.match(/(?:https?:\/\/)?([^/\s]+\.[^/\s]+)/i)
        if (match) {
          try {
            return new URL(`https://${match[1]}`).hostname.toLowerCase()
          } catch {
            return null
          }
        }
        return null
      }
    }

    for (const campaign of emailCampaigns) {
      let ctaLinks: any[] = []

      if (typeof campaign.ctaLinks === "string") {
        try {
          ctaLinks = JSON.parse(campaign.ctaLinks)
        } catch {
          continue
        }
      } else if (Array.isArray(campaign.ctaLinks)) {
        ctaLinks = campaign.ctaLinks
      }

      if (!Array.isArray(ctaLinks)) continue

      for (const link of ctaLinks) {
        if (!link) continue

        // Handle both string URLs and objects with url/finalUrl properties
        const urls: string[] = []

        if (typeof link === "string") {
          urls.push(link)
        } else if (typeof link === "object") {
          if (link.finalUrl) urls.push(link.finalUrl) // Prioritize finalUrl for donation platforms
          if (link.url) urls.push(link.url)
        }

        for (const url of urls) {
          const domain = extractDomain(url)
          if (domain) {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1
          }
        }
      }
    }

    for (const sms of smsMessages) {
      let ctaLinks: any[] = []

      if (typeof sms.ctaLinks === "string") {
        try {
          ctaLinks = JSON.parse(sms.ctaLinks)
        } catch {
          continue
        }
      } else if (Array.isArray(sms.ctaLinks)) {
        ctaLinks = sms.ctaLinks
      }

      if (!Array.isArray(ctaLinks)) continue

      for (const link of ctaLinks) {
        if (!link) continue

        const urls: string[] = []

        if (typeof link === "string") {
          urls.push(link)
        } else if (typeof link === "object") {
          if (link.finalUrl) urls.push(link.finalUrl)
          if (link.url) urls.push(link.url)
        }

        for (const url of urls) {
          const domain = extractDomain(url)
          if (domain) {
            domainCounts[domain] = (domainCounts[domain] || 0) + 1
          }
        }
      }
    }

    const sortedDomains = Object.entries(domainCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({ domain, count }))

    console.log(`[v0] Found ${sortedDomains.length} unique domains`)
    if (sortedDomains.length > 0) {
      console.log(`[v0] Top 5 domains:`, sortedDomains.slice(0, 5))
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalEmailCampaigns: emailCampaigns.length,
        totalSmsMessages: smsMessages.length,
        totalUniqueDomains: sortedDomains.length,
        totalLinkCount: sortedDomains.reduce((sum, d) => sum + d.count, 0),
      },
      domains: sortedDomains,
    })
  } catch (error) {
    console.error("[v0] Platform analysis error:", error)
    return NextResponse.json({ success: false, error: "Failed to analyze platforms" }, { status: 500 })
  }
}
