import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { extractWinRedIdentifiers } from "@/lib/ci-entity-utils"

export async function POST(req: Request) {
  const authResult = await verifyAuth(req)

  if (!authResult.success || !authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  try {
    console.log("[Official Trump Tracker Assignment] Starting assignment process...")

    // Get all unassigned campaigns from Official Trump Tracker
    const unassignedCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: null,
        senderEmail: "news@officialtrumptracker.com",
      },
      select: {
        id: true,
        subject: true,
        senderEmail: true,
        ctaLinks: true,
      },
    })

    console.log(
      `[Official Trump Tracker Assignment] Found ${unassignedCampaigns.length} unassigned campaigns from Official Trump Tracker`,
    )

    // Get all entities with donation identifiers
    const entitiesWithIdentifiers = await prisma.ciEntity.findMany({
      where: {
        donationIdentifiers: {
          not: null,
        },
      },
    })

    let assignedCount = 0
    let skippedCount = 0
    const results: Array<{
      campaignId: string
      subject: string
      action: string
      entityName?: string
    }> = []

    for (const campaign of unassignedCampaigns) {
      try {
        // Parse ctaLinks
        let ctaLinks: Array<{ url: string; finalUrl?: string }> = []
        try {
          if (typeof campaign.ctaLinks === "string") {
            ctaLinks = JSON.parse(campaign.ctaLinks)
          } else if (Array.isArray(campaign.ctaLinks)) {
            ctaLinks = campaign.ctaLinks
          }
        } catch (e) {
          console.error("Failed to parse ctaLinks:", e)
          skippedCount++
          results.push({
            campaignId: campaign.id,
            subject: campaign.subject || "No subject",
            action: "error",
          })
          continue
        }

        const urls = ctaLinks.map((link) => link.finalUrl || link.url)
        const winredIdentifiers = extractWinRedIdentifiers(urls)

        console.log(
          `[Official Trump Tracker Assignment] Campaign ${campaign.id}: Found ${winredIdentifiers.size} WinRed identifiers`,
        )

        // Try to find matching entity based on donation identifiers
        let matchedEntity = null

        if (winredIdentifiers.size > 0) {
          for (const entity of entitiesWithIdentifiers) {
            const entityIdentifiers = entity.donationIdentifiers as { winred?: string[]; anedot?: string[] } | null
            if (!entityIdentifiers?.winred) continue

            for (const identifier of winredIdentifiers) {
              if (entityIdentifiers.winred.includes(identifier)) {
                matchedEntity = { entity, identifier }
                break
              }
            }
            if (matchedEntity) break
          }
        }

        if (matchedEntity) {
          // Assign campaign to matched entity
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: {
              entityId: matchedEntity.entity.id,
              assignmentMethod: "auto_donation_identifier",
            },
          })

          assignedCount++
          results.push({
            campaignId: campaign.id,
            subject: campaign.subject || "No subject",
            action: "assigned",
            entityName: matchedEntity.entity.name,
          })

          console.log(
            `[Official Trump Tracker Assignment] Assigned campaign ${campaign.id} to ${matchedEntity.entity.name} via donation identifier`,
          )
        } else {
          // No matching entity found
          skippedCount++
          results.push({
            campaignId: campaign.id,
            subject: campaign.subject || "No subject",
            action: "skipped",
          })

          console.log(`[Official Trump Tracker Assignment] Skipped campaign ${campaign.id} - no matching entity found`)
        }
      } catch (error) {
        console.error(`[Official Trump Tracker Assignment] Error processing campaign ${campaign.id}:`, error)
        skippedCount++
        results.push({
          campaignId: campaign.id,
          subject: campaign.subject || "No subject",
          action: "error",
        })
      }
    }

    console.log(
      `[Official Trump Tracker Assignment] Assignment complete: ${assignedCount} assigned, ${skippedCount} skipped`,
    )

    return NextResponse.json({
      success: true,
      message: `Processed ${unassignedCampaigns.length} campaigns: ${assignedCount} assigned, ${skippedCount} skipped`,
      totalProcessed: unassignedCampaigns.length,
      assignedCount,
      skippedCount,
      results,
    })
  } catch (error) {
    console.error("[Official Trump Tracker Assignment] Error:", error)
    return NextResponse.json(
      {
        error: "Failed to assign Official Trump Tracker campaigns",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
