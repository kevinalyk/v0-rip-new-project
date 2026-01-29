import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// Extract Anedot identifiers from URLs
function extractAnedotIdentifiers(ctaLinks: any[]): string[] {
  const identifiers = new Set<string>()

  for (const link of ctaLinks) {
    // Check both url and finalUrl fields
    const urls = [link.url, link.finalUrl].filter(Boolean)

    for (const url of urls) {
      try {
        const urlObj = new URL(url)
        // Match secure.anedot.com/identifier/...
        if (urlObj.hostname === "secure.anedot.com" || urlObj.hostname === "anedot.com") {
          const pathParts = urlObj.pathname.split("/").filter(Boolean)
          if (pathParts.length > 0 && pathParts[0]) {
            identifiers.add(pathParts[0])
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  }

  return Array.from(identifiers)
}

export async function POST(request: Request) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[v0] Starting Anedot identifier auto-population for all entities...")

    // Fetch all entities (Republican, Democrat, Independent) but exclude data brokers
    const entities = await prisma.ciEntity.findMany({
      where: {
        type: {
          not: "data_broker",
        },
      },
      select: {
        id: true,
        name: true,
        party: true,
        donationIdentifiers: true,
        campaigns: {
          select: {
            ctaLinks: true,
          },
        },
        smsMessages: {
          select: {
            ctaLinks: true,
          },
        },
      },
    })

    console.log(`[v0] Found ${entities.length} total entities to process (excluding data brokers)`)

    const results = {
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as any[],
    }

    for (const entity of entities) {
      try {
        // Collect all CTA links from campaigns and SMS
        const allLinks: any[] = []
        entity.campaigns.forEach((campaign) => {
          if (campaign.ctaLinks && Array.isArray(campaign.ctaLinks)) {
            allLinks.push(...campaign.ctaLinks)
          }
        })
        entity.smsMessages.forEach((sms) => {
          if (sms.ctaLinks && Array.isArray(sms.ctaLinks)) {
            allLinks.push(...sms.ctaLinks)
          }
        })

        // Extract Anedot identifiers
        const anedotIdentifiers = extractAnedotIdentifiers(allLinks)

        if (anedotIdentifiers.length === 0) {
          console.log(`[v0] No Anedot identifiers found for ${entity.name}`)
          results.skipped++
          continue
        }

        // Parse existing donation identifiers
        let existingIdentifiers: any = {}
        if (entity.donationIdentifiers) {
          try {
            existingIdentifiers =
              typeof entity.donationIdentifiers === "string"
                ? JSON.parse(entity.donationIdentifiers)
                : entity.donationIdentifiers
          } catch (e) {
            existingIdentifiers = {}
          }
        }

        // Get existing Anedot identifiers
        const existingAnedot = existingIdentifiers.anedot || []
        const newAnedot = [...new Set([...existingAnedot, ...anedotIdentifiers])]

        // Check if we're adding any new identifiers
        if (newAnedot.length === existingAnedot.length) {
          console.log(`[v0] ${entity.name} already has all Anedot identifiers`)
          results.skipped++
          continue
        }

        // Update with new identifiers
        const updatedIdentifiers = {
          ...existingIdentifiers,
          anedot: newAnedot,
        }

        await prisma.ciEntity.update({
          where: { id: entity.id },
          data: {
            donationIdentifiers: updatedIdentifiers,
          },
        })

        console.log(`[v0] Updated ${entity.name} with Anedot identifiers: ${newAnedot.join(", ")}`)
        results.updated++
        results.details.push({
          entityName: entity.name,
          party: entity.party,
          identifiers: newAnedot,
        })
      } catch (error) {
        console.error(`[v0] Error processing entity ${entity.name}:`, error)
        results.errors++
      }
    }

    console.log("[v0] Anedot identifier auto-population completed:", results)

    return NextResponse.json({
      success: true,
      summary: {
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors,
      },
      details: results.details.slice(0, 50), // Return first 50 for preview
    })
  } catch (error) {
    console.error("[v0] Error in auto-populate Anedot:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
