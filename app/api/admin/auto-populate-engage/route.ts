import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { extractEngageIdentifiers } from "@/lib/ci-entity-utils"

export async function POST(request: Request) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[auto-populate-engage] Starting Engage identifier auto-population for all entities...")

    // All entities except data brokers
    const entities = await prisma.ciEntity.findMany({
      where: {
        type: { not: "data_broker" },
      },
      select: {
        id: true,
        name: true,
        party: true,
        donationIdentifiers: true,
        campaigns: {
          select: { ctaLinks: true },
        },
        smsMessages: {
          select: { ctaLinks: true },
        },
      },
    })

    console.log(`[auto-populate-engage] Found ${entities.length} entities to process`)

    const results = {
      updated: 0,
      skipped: 0,
      errors: 0,
      details: [] as Array<{ entityName: string; party: string | null; identifiers: string[] }>,
    }

    for (const entity of entities) {
      try {
        // Collect all CTA links from campaigns and SMS
        const allLinks: any[] = []
        for (const campaign of entity.campaigns) {
          if (Array.isArray(campaign.ctaLinks)) allLinks.push(...campaign.ctaLinks)
        }
        for (const sms of entity.smsMessages) {
          if (Array.isArray(sms.ctaLinks)) allLinks.push(...sms.ctaLinks)
        }

        // Use the shared extract function
        const found = extractEngageIdentifiers(allLinks)

        if (found.size === 0) {
          results.skipped++
          continue
        }

        // Parse existing donation identifiers
        let existing: any = {}
        if (entity.donationIdentifiers) {
          try {
            existing =
              typeof entity.donationIdentifiers === "string"
                ? JSON.parse(entity.donationIdentifiers)
                : entity.donationIdentifiers
          } catch {
            existing = {}
          }
        }

        // Merge — preserve existing, add newly found
        const merged = {
          ...existing,
          engage: Array.from(new Set([...(existing.engage || []), ...Array.from(found)])),
        }

        // Update entity
        await prisma.ciEntity.update({
          where: { id: entity.id },
          data: {
            donationIdentifiers: merged,
          },
        })

        results.updated++
        const identifiers = Array.from(found)
        results.details.push({
          entityName: entity.name,
          party: entity.party || null,
          identifiers,
        })
        console.log(
          `[auto-populate-engage] Updated entity "${entity.name}" with ${identifiers.length} Engage identifier(s): ${identifiers.join(", ")}`
        )
      } catch (error: any) {
        results.errors++
        console.error(`[auto-populate-engage] Error processing entity ${entity.id}:`, error.message)
      }
    }

    console.log(
      `[auto-populate-engage] Completed - Updated: ${results.updated}, Skipped: ${results.skipped}, Errors: ${results.errors}`
    )

    return NextResponse.json(results)
  } catch (error: any) {
    console.error("[auto-populate-engage] Error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
