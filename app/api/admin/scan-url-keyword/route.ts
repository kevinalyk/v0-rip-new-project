import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface UrlMatch {
  fullUrl: string
  hostname: string
  pathname: string
  count: number
  sources: { type: "email" | "sms"; id: string }[]
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication and super_admin role
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const keyword = (body.keyword || "").toLowerCase().trim()

    if (!keyword || keyword.length < 2) {
      return NextResponse.json({ error: "Keyword must be at least 2 characters" }, { status: 400 })
    }

    console.log(`[v0] Starting URL keyword scan for: "${keyword}"`)

    // Fetch all campaigns with CTA links
    const emailCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        ctaLinks: {
          not: null,
        },
      },
      select: {
        id: true,
        ctaLinks: true,
      },
    })

    // Fetch all SMS messages with CTA links
    const smsMessages = await prisma.smsQueue.findMany({
      where: {
        ctaLinks: {
          not: null,
        },
      },
      select: {
        id: true,
        ctaLinks: true,
      },
    })

    console.log(`[v0] Scanning ${emailCampaigns.length} email campaigns and ${smsMessages.length} SMS messages`)

    // Track unique URLs and their occurrences
    const urlMap = new Map<string, UrlMatch>()

    const processLinks = (links: any, sourceType: "email" | "sms", sourceId: string) => {
      if (!links) return

      const linksArray = Array.isArray(links) ? links : []

      for (const link of linksArray) {
        const url = link.finalUrl || link.url
        if (!url) continue

        try {
          const urlObj = new URL(url)
          const fullUrlLower = url.toLowerCase()

          // Check if URL contains the keyword anywhere
          if (fullUrlLower.includes(keyword)) {
            // Normalize the URL for grouping (remove query params and trailing slashes)
            const normalizedUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.pathname.replace(/\/$/, "")}`

            if (urlMap.has(normalizedUrl)) {
              const existing = urlMap.get(normalizedUrl)!
              existing.count++
              // Only keep first 5 source examples
              if (existing.sources.length < 5) {
                existing.sources.push({ type: sourceType, id: sourceId })
              }
            } else {
              urlMap.set(normalizedUrl, {
                fullUrl: normalizedUrl,
                hostname: urlObj.hostname,
                pathname: urlObj.pathname,
                count: 1,
                sources: [{ type: sourceType, id: sourceId }],
              })
            }
          }
        } catch {
          // Invalid URL, skip
          continue
        }
      }
    }

    // Process email campaigns
    for (const campaign of emailCampaigns) {
      processLinks(campaign.ctaLinks, "email", campaign.id)
    }

    // Process SMS messages
    for (const message of smsMessages) {
      processLinks(message.ctaLinks, "sms", message.id)
    }

    // Convert to array and sort by count (most common first)
    const matches = Array.from(urlMap.values()).sort((a, b) => b.count - a.count)

    console.log(`[v0] Found ${matches.length} unique URLs containing "${keyword}"`)

    // Group by hostname for summary
    const hostnameSummary = matches.reduce(
      (acc, m) => {
        if (!acc[m.hostname]) {
          acc[m.hostname] = { count: 0, urls: 0 }
        }
        acc[m.hostname].count += m.count
        acc[m.hostname].urls++
        return acc
      },
      {} as Record<string, { count: number; urls: number }>,
    )

    // Sort hostname summary by total occurrences
    const sortedHostnames = Object.entries(hostnameSummary)
      .sort(([, a], [, b]) => b.count - a.count)
      .reduce(
        (acc, [k, v]) => {
          acc[k] = v
          return acc
        },
        {} as Record<string, { count: number; urls: number }>,
      )

    return NextResponse.json({
      success: true,
      keyword,
      summary: {
        uniqueUrls: matches.length,
        totalOccurrences: matches.reduce((sum, m) => sum + m.count, 0),
        hostnames: sortedHostnames,
      },
      matches: matches.slice(0, 100), // Limit to first 100 for UI
    })
  } catch (error) {
    console.error("[v0] Error scanning URL keyword:", error)
    return NextResponse.json({ error: "Failed to scan URLs" }, { status: 500 })
  }
}
