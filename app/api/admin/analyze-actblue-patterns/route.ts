import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

interface ActBluePattern {
  pattern: string // e.g., "donate", "contribute/page"
  identifier: string // e.g., "hs_mw_2025_email_wrapper"
  fullUrl: string
  count: number
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication and super_admin role
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Starting ActBlue pattern analysis...")

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

    console.log(`[v0] Found ${emailCampaigns.length} email campaigns and ${smsMessages.length} SMS messages to scan`)

    // Extract all ActBlue URLs and their patterns
    const patternMap = new Map<string, ActBluePattern>()

    const processLinks = (links: any) => {
      if (!links) return

      const linksArray = Array.isArray(links) ? links : []

      for (const link of linksArray) {
        const url = link.finalUrl || link.url
        if (!url) continue

        try {
          const urlObj = new URL(url)

          // Check if it's an ActBlue URL
          if (urlObj.hostname.includes("actblue.com")) {
            const pathname = urlObj.pathname
            const pathParts = pathname.split("/").filter(Boolean)

            if (pathParts.length > 0) {
              // Determine pattern type
              let pattern = ""
              let identifier = ""

              if (pathParts[0] === "donate" && pathParts.length > 1) {
                pattern = "donate"
                identifier = pathParts[1]
              } else if (pathParts[0] === "contribute" && pathParts[1] === "page" && pathParts.length > 2) {
                pattern = "contribute/page"
                identifier = pathParts[2]
              } else if (pathParts[0] === "donate") {
                pattern = "donate"
                identifier = "(no identifier)"
              } else if (pathParts[0] === "contribute") {
                pattern = "contribute"
                identifier = pathParts.length > 1 ? pathParts[1] : "(no identifier)"
              } else {
                // Other pattern
                pattern = pathParts[0] || "unknown"
                identifier = pathParts.length > 1 ? pathParts[1] : "(no identifier)"
              }

              const key = `${pattern}::${identifier}`

              if (patternMap.has(key)) {
                const existing = patternMap.get(key)!
                existing.count++
              } else {
                patternMap.set(key, {
                  pattern,
                  identifier,
                  fullUrl: url,
                  count: 1,
                })
              }
            }
          }
        } catch (error) {
          // Invalid URL, skip
          continue
        }
      }
    }

    // Process email campaigns
    for (const campaign of emailCampaigns) {
      processLinks(campaign.ctaLinks)
    }

    // Process SMS messages
    for (const message of smsMessages) {
      processLinks(message.ctaLinks)
    }

    // Convert to array and sort alphabetically by pattern, then identifier
    const patterns = Array.from(patternMap.values()).sort((a, b) => {
      if (a.pattern !== b.pattern) {
        return a.pattern.localeCompare(b.pattern)
      }
      return a.identifier.localeCompare(b.identifier)
    })

    console.log(`[v0] Found ${patterns.length} unique ActBlue URL patterns`)

    // Group by pattern type for summary
    const patternSummary = patterns.reduce(
      (acc, p) => {
        if (!acc[p.pattern]) {
          acc[p.pattern] = 0
        }
        acc[p.pattern]++
        return acc
      },
      {} as Record<string, number>,
    )

    return NextResponse.json({
      success: true,
      summary: {
        totalPatterns: patterns.length,
        totalOccurrences: patterns.reduce((sum, p) => sum + p.count, 0),
        patternTypes: patternSummary,
      },
      patterns,
    })
  } catch (error) {
    console.error("[v0] Error analyzing ActBlue patterns:", error)
    return NextResponse.json({ error: "Failed to analyze ActBlue patterns" }, { status: 500 })
  }
}
