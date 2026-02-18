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
    // Find all unassigned campaigns from Daily GOP News
    const unassignedCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        senderEmail: "updates@emails.dailygopnews.com",
        entityId: null,
      },
      select: {
        id: true,
        subject: true,
        ctaLinks: true,
      },
    })

    // Get all entities with donation identifiers
    const entitiesWithIdentifiers = await prisma.ciEntity.findMany({
      where: {
        donationIdentifiers: {
          not: null,
        },
      },
    })

    let assignedCount = 0
    let noMatchCount = 0
    const sampleAssignments: Array<{ campaign: string; entity: string; identifier: string }> = []

    // Process each campaign
    for (const campaign of unassignedCampaigns) {
      let ctaLinks: Array<{ url: string; finalUrl?: string }> = []
      try {
        if (typeof campaign.ctaLinks === "string") {
          ctaLinks = JSON.parse(campaign.ctaLinks)
        } else if (Array.isArray(campaign.ctaLinks)) {
          ctaLinks = campaign.ctaLinks
        }
      } catch (e) {
        console.error("Failed to parse ctaLinks:", e)
        noMatchCount++
        continue
      }

      const urls = ctaLinks.map((link) => link.finalUrl || link.url)
      const winredIdentifiers = extractWinRedIdentifiers(urls)

      if (winredIdentifiers.size === 0) {
        noMatchCount++
        continue
      }

      // Find matching entity
      let matchedEntity = null
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

      if (matchedEntity) {
        // Assign campaign
        await prisma.competitiveInsightCampaign.update({
          where: { id: campaign.id },
          data: {
            entityId: matchedEntity.entity.id,
            assignmentMethod: "auto_donation_identifier",
          },
        })

        assignedCount++

        if (sampleAssignments.length < 10) {
          sampleAssignments.push({
            campaign: campaign.subject || "No subject",
            entity: matchedEntity.entity.name,
            identifier: matchedEntity.identifier,
          })
        }
      } else {
        noMatchCount++
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: unassignedCampaigns.length,
        assigned: assignedCount,
        noMatch: noMatchCount,
      },
      sampleAssignments,
    })
  } catch (error) {
    console.error("Error assigning Daily GOP News campaigns:", error)
    return NextResponse.json({ error: "Failed to assign campaigns" }, { status: 500 })
  }
}
