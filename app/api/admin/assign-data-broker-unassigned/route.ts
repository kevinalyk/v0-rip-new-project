import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function POST(req: Request) {
  const authResult = await verifyAuth(req)
  if (!authResult.success || !authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  try {
    // Define the data broker domains to process
    const dataBrokerDomains = [
      "americanliberty.news",
      "americanlibertywatch.com",
      "patriotactionjournal.com",
      "americanlibertydefense.com",
    ]

    // Find all unassigned campaigns from these domains
    const unassignedCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: null,
        OR: dataBrokerDomains.map((domain) => ({
          senderEmail: {
            contains: domain,
          },
        })),
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

      const containsAmericanLibertyDomain = urls.some((url) => url.includes("americanliberty.news"))

      // Rule 1: If 9+ links AND contains americanliberty.news domain → Assign to data_broker
      if (linkCount >= 9 && containsAmericanLibertyDomain) {
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
            method: "Newsletter (9+ links + americanliberty.news domain)",
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
          } else if (match.assignmentMethod === "auto_actblue") {
            results.assignedViaActBlue = (results.assignedViaActBlue ?? 0) + 1
          } else if (match.assignmentMethod === "auto_psqimpact") {
            results.assignedViaPSQ = (results.assignedViaPSQ ?? 0) + 1
          }

          const methodLabels: Record<string, string> = {
            auto_winred: "WinRed Identifier",
            auto_anedot: "Anedot Identifier",
            auto_actblue: "ActBlue Identifier",
            auto_psqimpact: "PSQ Identifier",
          }
          results.assignments.push({
            campaignId: campaign.id,
            senderEmail: campaign.senderEmail,
            assignedTo: match.entityName,
            method: methodLabels[match.assignmentMethod] || match.assignmentMethod,
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
    console.error("Error assigning data broker campaigns:", error)
    return NextResponse.json({ error: "Failed to assign campaigns" }, { status: 500 })
  }
}

async function checkDonationIdentifiers(
  urls: string[],
  entities: Array<{ id: string; name: string; donationIdentifiers: any }>,
): Promise<{ entityId: string; entityName: string; assignmentMethod: "auto_winred" | "auto_anedot" | "auto_actblue" | "auto_psqimpact" } | null> {
  const winredIds = new Set<string>()
  const anedotIds = new Set<string>()
  const actblueIds = new Set<string>()
  const psqIds = new Set<string>()

  for (const url of urls) {
    try {
      const urlObj = new URL(url)
      const parts = urlObj.pathname.split("/").filter(Boolean)
      // PSQ first (prioritize over WinRed since PSQ emails often contain WinRed merch links)
      if (urlObj.hostname.includes("psqimpact.com") && parts[0] === "donate" && parts[1]) {
        psqIds.add(parts[1].toLowerCase())
      } else if (urlObj.hostname.includes("winred.com") && parts[0]) {
        winredIds.add(parts[0].toLowerCase())
      } else if (urlObj.hostname.includes("anedot.com") && parts[0]) {
        anedotIds.add(parts[0].toLowerCase())
      } else if (urlObj.hostname.includes("actblue.com")) {
        if (parts[0] === "donate" && parts[1]) actblueIds.add(parts[1].toLowerCase())
        if (parts[0] === "contribute" && parts[1] === "page" && parts[2]) actblueIds.add(parts[2].toLowerCase())
      }
    } catch {
      // Invalid URL, skip
    }
  }

  for (const entity of entities) {
    if (!entity.donationIdentifiers) continue
    let identifiers: any
    try {
      identifiers = typeof entity.donationIdentifiers === "string" ? JSON.parse(entity.donationIdentifiers) : entity.donationIdentifiers
    } catch { continue }

    // Check PSQ first (higher priority)
    if (identifiers.psqimpact && Array.isArray(identifiers.psqimpact)) {
      for (const id of psqIds) {
        if (identifiers.psqimpact.includes(id)) return { entityId: entity.id, entityName: entity.name, assignmentMethod: "auto_psqimpact" }
      }
    }
    if (identifiers.winred && Array.isArray(identifiers.winred)) {
      for (const id of winredIds) {
        if (identifiers.winred.includes(id)) return { entityId: entity.id, entityName: entity.name, assignmentMethod: "auto_winred" }
      }
    }
    if (identifiers.anedot && Array.isArray(identifiers.anedot)) {
      for (const id of anedotIds) {
        if (identifiers.anedot.includes(id)) return { entityId: entity.id, entityName: entity.name, assignmentMethod: "auto_anedot" }
      }
    }
    if (identifiers.actblue && Array.isArray(identifiers.actblue)) {
      for (const id of actblueIds) {
        if (identifiers.actblue.includes(id)) return { entityId: entity.id, entityName: entity.name, assignmentMethod: "auto_actblue" }
      }
    }
  }

  return null
}
