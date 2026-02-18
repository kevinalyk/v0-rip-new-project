import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function POST(req: Request) {
  const authResult = await verifyAuth(req)
  if (!authResult.success || !authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  try {
    // Find all unassigned campaigns from Liberty Action News
    const unassignedCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: null,
        OR: [
          { senderEmail: { contains: "libertyaction.news" } },
          { senderEmail: { contains: "libertybreaking.news" } },
        ],
      },
      select: {
        id: true,
        senderEmail: true,
        ctaLinks: true,
      },
    })

    const results = {
      total: unassignedCampaigns.length,
      assignedToDataBroker: 0,
      assignedViaWinRed: 0,
      assignedViaAnedot: 0,
      noMatch: 0,
      assignments: [] as Array<{
        campaignId: string
        senderEmail: string
        assignedTo: string
        method: string
      }>,
    }

    const entitiesWithIdentifiers = await prisma.ciEntity.findMany({
      where: {
        donationIdentifiers: { not: null },
      },
      select: {
        id: true,
        name: true,
        donationIdentifiers: true,
      },
    })

    for (const campaign of unassignedCampaigns) {
      // Parse CTA links
      let ctaLinks: Array<{ url: string; finalUrl?: string; type: string }> = []
      try {
        if (typeof campaign.ctaLinks === "string") {
          ctaLinks = JSON.parse(campaign.ctaLinks)
        } else if (Array.isArray(campaign.ctaLinks)) {
          ctaLinks = campaign.ctaLinks as Array<{ url: string; finalUrl?: string; type: string }>
        }
      } catch (e) {
        console.error(`Failed to parse CTA links for campaign ${campaign.id}`)
        continue
      }

      const linkCount = ctaLinks.length
      const urls = ctaLinks.map((link) => link.finalUrl || link.url)

      const containsRevenueStripeDomain = urls.some((url) => {
        try {
          const urlObj = new URL(url)
          const hostname = urlObj.hostname.toLowerCase()
          const pathname = urlObj.pathname

          // Check if hostname matches (with or without www) and pathname is just "/" or empty
          return (
            (hostname === "branding.revenuestripe.com" || hostname === "www.branding.revenuestripe.com") &&
            (pathname === "/" || pathname === "")
          )
        } catch {
          return false
        }
      })

      // Rule 1: If 9+ links AND contains branding.revenuestripe.com → Assign to Liberty Action News data broker
      if (linkCount >= 9 && containsRevenueStripeDomain) {
        const domain = campaign.senderEmail.split("@")[1]
        const dataBroker = await prisma.ciEntity.findFirst({
          where: {
            type: "data_broker",
            mappings: {
              some: {
                senderDomain: domain,
              },
            },
          },
        })

        if (dataBroker) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: {
              entityId: dataBroker.id,
              assignmentMethod: "auto_domain",
            },
          })

          results.assignedToDataBroker++
          results.assignments.push({
            campaignId: campaign.id,
            senderEmail: campaign.senderEmail,
            assignedTo: dataBroker.name,
            method: "Newsletter (9+ links + revenuestripe.com domain)",
          })
        }
      }
      // Rule 2: Otherwise, check WinRed/Anedot identifiers
      else {
        const match = await checkDonationIdentifiers(urls, entitiesWithIdentifiers)

        if (match) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: {
              entityId: match.entityId,
              assignmentMethod: match.assignmentMethod,
            },
          })

          if (match.assignmentMethod === "auto_winred") {
            results.assignedViaWinRed++
          } else if (match.assignmentMethod === "auto_anedot") {
            results.assignedViaAnedot++
          }

          results.assignments.push({
            campaignId: campaign.id,
            senderEmail: campaign.senderEmail,
            assignedTo: match.entityName,
            method: match.assignmentMethod === "auto_winred" ? "WinRed Identifier" : "Anedot Identifier",
          })
        } else {
          results.noMatch++
        }
      }
    }

    return NextResponse.json({
      success: true,
      results,
    })
  } catch (error) {
    console.error("Error assigning Liberty Action News campaigns:", error)
    return NextResponse.json({ error: "Failed to assign campaigns" }, { status: 500 })
  }
}

async function checkDonationIdentifiers(
  urls: string[],
  entities: Array<{ id: string; name: string; donationIdentifiers: any }>,
): Promise<{ entityId: string; entityName: string; assignmentMethod: "auto_winred" | "auto_anedot" } | null> {
  // Extract WinRed identifiers
  const winredIds = new Set<string>()
  for (const url of urls) {
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("winred.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          winredIds.add(pathParts[0].toLowerCase())
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // Extract Anedot identifiers
  const anedotIds = new Set<string>()
  for (const url of urls) {
    try {
      const urlObj = new URL(url)
      if (urlObj.hostname.includes("anedot.com")) {
        const pathParts = urlObj.pathname.split("/").filter(Boolean)
        if (pathParts.length > 0 && pathParts[0]) {
          anedotIds.add(pathParts[0].toLowerCase())
        }
      }
    } catch {
      // Invalid URL, skip
    }
  }

  // Check each entity's identifiers
  for (const entity of entities) {
    if (!entity.donationIdentifiers) continue

    let identifiers: any
    if (typeof entity.donationIdentifiers === "string") {
      try {
        identifiers = JSON.parse(entity.donationIdentifiers)
      } catch {
        continue
      }
    } else {
      identifiers = entity.donationIdentifiers
    }

    // Check WinRed first
    if (identifiers.winred && Array.isArray(identifiers.winred)) {
      for (const id of winredIds) {
        if (identifiers.winred.includes(id)) {
          return {
            entityId: entity.id,
            entityName: entity.name,
            assignmentMethod: "auto_winred",
          }
        }
      }
    }

    // Check Anedot
    if (identifiers.anedot && Array.isArray(identifiers.anedot)) {
      for (const id of anedotIds) {
        if (identifiers.anedot.includes(id)) {
          return {
            entityId: entity.id,
            entityName: entity.name,
            assignmentMethod: "auto_anedot",
          }
        }
      }
    }
  }

  return null
}
