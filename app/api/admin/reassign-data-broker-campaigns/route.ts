import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { extractWinRedIdentifiers, extractAnedotIdentifiers } from "@/lib/ci-entity-utils"

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req)
  if (!authResult.success || authResult.user?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: null,
      },
      select: {
        id: true,
        subject: true,
        senderEmail: true,
        ctaLinks: true,
        entityId: true,
      },
    })

    console.log(`[v0] Found ${campaigns.length} unassigned campaigns`)

    const assignments: Array<{
      campaignId: string
      subject: string
      to: string
      method: string
    }> = []
    let skipped = 0
    let errors = 0

    // Get all entities with donation identifiers for matching
    const allEntities = await prisma.ciEntity.findMany({
      where: {
        donationIdentifiers: { not: null },
      },
      select: {
        id: true,
        name: true,
        donationIdentifiers: true,
      },
    })

    const americanLibertyMuse = await prisma.ciEntity.findFirst({
      where: {
        type: "data_broker",
        mappings: {
          some: {
            senderDomain: "americanlibertymuse.com",
          },
        },
      },
      select: { id: true, name: true },
    })

    const libertyActionDataBrokers = await prisma.ciEntity.findMany({
      where: {
        type: "data_broker",
        mappings: {
          some: {
            OR: [{ senderDomain: "libertyaction.news" }, { senderDomain: "libertybreaking.news" }],
          },
        },
      },
      select: { id: true, name: true, mappings: true },
    })

    for (const campaign of campaigns) {
      try {
        // Parse CTA links
        let ctaLinks: any[] = []
        if (campaign.ctaLinks) {
          try {
            ctaLinks = typeof campaign.ctaLinks === "string" ? JSON.parse(campaign.ctaLinks) : campaign.ctaLinks
          } catch {
            console.log(`[v0] Could not parse CTA links for campaign ${campaign.id}`)
            skipped++
            continue
          }
        }

        if (!Array.isArray(ctaLinks) || ctaLinks.length === 0) {
          skipped++
          continue
        }

        const linkCount = ctaLinks.length
        const urls = ctaLinks.map((link: any) => link.finalUrl || link.url)

        // Check for American Liberty Muse newsletter pattern
        if (campaign.senderEmail?.includes("americanlibertymuse.com")) {
          const containsAmericanLibertyDomain = urls.some(
            (url: string) => url.includes("americanliberty.news") || url.includes("www.americanliberty.news"),
          )

          if (linkCount >= 9 && containsAmericanLibertyDomain && americanLibertyMuse) {
            // This is a newsletter - assign to American Liberty Muse
            await prisma.competitiveInsightCampaign.update({
              where: { id: campaign.id },
              data: {
                entityId: americanLibertyMuse.id,
                assignmentMethod: "auto_domain",
              },
            })

            assignments.push({
              campaignId: campaign.id,
              subject: campaign.subject || "No subject",
              to: americanLibertyMuse.name,
              method: "Newsletter (9+ links + americanliberty.news)",
            })
            continue
          }
        }

        // Check for Liberty Action News newsletter pattern
        if (
          campaign.senderEmail?.includes("libertyaction.news") ||
          campaign.senderEmail?.includes("libertybreaking.news")
        ) {
          const containsRevenueStripeDomain = urls.some((url: string) => {
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

          if (linkCount >= 9 && containsRevenueStripeDomain) {
            // This is a newsletter - find the correct data broker for this domain
            const domain = campaign.senderEmail.split("@")[1]
            const dataBroker = libertyActionDataBrokers.find((db) =>
              db.mappings.some((m: any) => m.senderDomain === domain),
            )

            if (dataBroker) {
              await prisma.competitiveInsightCampaign.update({
                where: { id: campaign.id },
                data: {
                  entityId: dataBroker.id,
                  assignmentMethod: "auto_domain",
                },
              })

              assignments.push({
                campaignId: campaign.id,
                subject: campaign.subject || "No subject",
                to: dataBroker.name,
                method: "Newsletter (9+ links + revenuestripe.com)",
              })
            } else {
              skipped++
            }
            continue
          }
        }

        // Try WinRed/Anedot matching
        const winredIdentifiers = extractWinRedIdentifiers(ctaLinks)
        const anedotIdentifiers = extractAnedotIdentifiers(ctaLinks)

        if (winredIdentifiers.size === 0 && anedotIdentifiers.size === 0) {
          skipped++
          continue
        }

        // Find matching entity
        let matchedEntity: { id: string; name: string; method: string } | null = null

        for (const entity of allEntities) {
          if (!entity.donationIdentifiers) continue

          let identifiers: any = {}
          try {
            identifiers =
              typeof entity.donationIdentifiers === "string"
                ? JSON.parse(entity.donationIdentifiers)
                : entity.donationIdentifiers
          } catch {
            continue
          }

          // Check WinRed identifiers
          if (identifiers.winred && Array.isArray(identifiers.winred)) {
            for (const identifier of winredIdentifiers) {
              if (identifiers.winred.includes(identifier)) {
                matchedEntity = { id: entity.id, name: entity.name, method: "auto_winred" }
                break
              }
            }
          }

          // Check Anedot identifiers
          if (!matchedEntity && identifiers.anedot && Array.isArray(identifiers.anedot)) {
            for (const identifier of anedotIdentifiers) {
              if (identifiers.anedot.includes(identifier)) {
                matchedEntity = { id: entity.id, name: entity.name, method: "auto_anedot" }
                break
              }
            }
          }

          if (matchedEntity) break
        }

        // If we found an entity, assign it
        if (matchedEntity) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: {
              entityId: matchedEntity.id,
              assignmentMethod: matchedEntity.method,
            },
          })

          assignments.push({
            campaignId: campaign.id,
            subject: campaign.subject || "No subject",
            to: matchedEntity.name,
            method: matchedEntity.method,
          })

          console.log(`[v0] Assigned: "${campaign.subject}" to ${matchedEntity.name}`)
        } else {
          skipped++
        }
      } catch (error) {
        console.error(`[v0] Error processing campaign ${campaign.id}:`, error)
        errors++
      }
    }

    console.log(`[v0] Bulk assignment complete: ${assignments.length} assigned, ${skipped} skipped, ${errors} errors`)

    return NextResponse.json({
      success: true,
      summary: {
        total: campaigns.length,
        assigned: assignments.length,
        skipped,
        errors,
      },
      assignments: assignments.slice(0, 100), // Return first 100 for preview
    })
  } catch (error) {
    console.error("[v0] Bulk assignment error:", error)
    return NextResponse.json({ error: "Failed to assign campaigns" }, { status: 500 })
  }
}
