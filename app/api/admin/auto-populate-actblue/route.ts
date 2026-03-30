import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { extractActBlueIdentifiers } from "@/lib/ci-entity-utils"

export async function POST(request: Request) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[auto-populate-actblue] Starting ActBlue identifier auto-population for all entities...")

    // All entities except data brokers — ActBlue is primarily Democrat/left-leaning
    // but scan everything so we don't miss any edge cases
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

    console.log(`[auto-populate-actblue] Found ${entities.length} entities to process`)

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

        // Use the shared extract function — handles both /donate/ and /contribute/page/
        const found = extractActBlueIdentifiers(allLinks)

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
        const existingActBlue: string[] = existing.actblue || []
        const merged = [...new Set([...existingActBlue, ...found])]

        if (merged.length === existingActBlue.length) {
          // Nothing new to add
          results.skipped++
          continue
        }

        await prisma.ciEntity.update({
          where: { id: entity.id },
          data: {
            donationIdentifiers: { ...existing, actblue: merged },
          },
        })

        console.log(`[auto-populate-actblue] Updated ${entity.name}: ${merged.join(", ")}`)
        results.updated++
        results.details.push({
          entityName: entity.name,
          party: entity.party,
          identifiers: merged,
        })
      } catch (error) {
        console.error(`[auto-populate-actblue] Error processing ${entity.name}:`, error)
        results.errors++
      }
    }

    console.log("[auto-populate-actblue] Completed:", results)

    return NextResponse.json({
      success: true,
      summary: {
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors,
      },
      details: results.details.slice(0, 50),
    })
  } catch (error) {
    console.error("[auto-populate-actblue] Fatal error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
