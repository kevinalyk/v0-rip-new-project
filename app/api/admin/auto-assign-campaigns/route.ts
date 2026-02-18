import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { extractWinRedIdentifiers, extractAnedotIdentifiers, extractPSQIdentifiers } from "@/lib/ci-entity-utils"

export const maxDuration = 300 // 5 minutes

/**
 * Auto-assign unassigned campaigns (both email and SMS) to entities
 * based on donation identifiers (WinRed, Anedot, PSQ, ActBlue)
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[Admin] Starting campaign auto-assignment process")

    // Step 1: Get all entities with donation identifiers
    const entities = await prisma.ciEntity.findMany({
      where: {
        donationIdentifiers: { not: null },
        type: { not: "data_broker" },
      },
      select: {
        id: true,
        name: true,
        donationIdentifiers: true,
      },
    })

    console.log(`[Admin] Found ${entities.length} entities with donation identifiers`)

    // Parse entity identifiers once
    const entityIdentifiers = new Map<
      string,
      {
        id: string
        name: string
        winred: string[]
        anedot: string[]
        psq: string[]
        actblue: string[]
      }
    >()

    for (const entity of entities) {
      let identifiers: any = {}
      if (entity.donationIdentifiers) {
        try {
          identifiers =
            typeof entity.donationIdentifiers === "string"
              ? JSON.parse(entity.donationIdentifiers)
              : entity.donationIdentifiers
        } catch (e) {
          console.error(`[Admin] Error parsing donation identifiers for entity ${entity.id}:`, e)
          continue
        }
      }

      entityIdentifiers.set(entity.id, {
        id: entity.id,
        name: entity.name,
        winred: (identifiers.winred || []).map((id: string) => id.toLowerCase()),
        anedot: (identifiers.anedot || []).map((id: string) => id.toLowerCase()),
        psq: (identifiers.psq || []).map((id: string) => id.toLowerCase()),
        actblue: (identifiers.actblue || []).map((id: string) => id.toLowerCase()),
      })
    }

    // Step 2: Get domains linked to data broker entities
    const dataBrokerDomains = await prisma.ciDomainToEntity.findMany({
      where: {
        entity: {
          type: "data_broker",
        },
      },
      select: {
        domainId: true,
      },
    })

    const dataBrokerDomainIds = dataBrokerDomains.map((d) => d.domainId)

    // Process unassigned email campaigns (excluding data broker campaigns)
    const unassignedCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: null,
        // Exclude campaigns from data broker domains
        domainId: {
          notIn: dataBrokerDomainIds,
        },
      },
      select: {
        id: true,
        subject: true,
        ctaLinks: true,
      },
      take: 1000, // Process in batches
    })

    console.log(`[Admin] Found ${unassignedCampaigns.length} unassigned email campaigns`)

    let emailAssignedCount = 0
    const emailResults: Array<{
      id: string
      subject: string
      assigned: boolean
      entityName?: string
      method?: string
      error?: string
    }> = []

    for (const campaign of unassignedCampaigns) {
      try {
        const matchResult = await matchCampaignToEntity(campaign.ctaLinks, entityIdentifiers)

        if (matchResult) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: {
              entityId: matchResult.entityId,
              assignmentMethod: matchResult.method,
              assignedAt: new Date(),
            },
          })

          emailAssignedCount++
          emailResults.push({
            id: campaign.id,
            subject: campaign.subject || "No subject",
            assigned: true,
            entityName: matchResult.entityName,
            method: matchResult.method,
          })
        } else {
          emailResults.push({
            id: campaign.id,
            subject: campaign.subject || "No subject",
            assigned: false,
            error: "No matching entity found",
          })
        }
      } catch (error) {
        console.error(`[Admin] Error processing email campaign ${campaign.id}:`, error)
        emailResults.push({
          id: campaign.id,
          subject: campaign.subject || "No subject",
          assigned: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    // Step 3: Process unassigned SMS messages
    const unassignedSms = await prisma.smsQueue.findMany({
      where: {
        entityId: null,
        processed: true,
      },
      select: {
        id: true,
        phoneNumber: true,
        ctaLinks: true,
      },
      take: 1000, // Process in batches
    })

    console.log(`[Admin] Found ${unassignedSms.length} unassigned SMS messages`)

    let smsAssignedCount = 0
    const smsResults: Array<{
      id: string
      phoneNumber: string | null
      assigned: boolean
      entityName?: string
      method?: string
      error?: string
    }> = []

    for (const sms of unassignedSms) {
      try {
        // Parse CTA links if they exist
        let parsedLinks: any = null
        if (sms.ctaLinks) {
          try {
            parsedLinks = JSON.parse(sms.ctaLinks)
          } catch (e) {
            parsedLinks = sms.ctaLinks
          }
        }

        const matchResult = await matchCampaignToEntity(parsedLinks, entityIdentifiers)

        if (matchResult) {
          await prisma.smsQueue.update({
            where: { id: sms.id },
            data: {
              entityId: matchResult.entityId,
              assignmentMethod: matchResult.method,
              assignedAt: new Date(),
            },
          })

          smsAssignedCount++
          smsResults.push({
            id: sms.id,
            phoneNumber: sms.phoneNumber,
            assigned: true,
            entityName: matchResult.entityName,
            method: matchResult.method,
          })
        } else {
          smsResults.push({
            id: sms.id,
            phoneNumber: sms.phoneNumber,
            assigned: false,
            error: "No matching entity found",
          })
        }
      } catch (error) {
        console.error(`[Admin] Error processing SMS ${sms.id}:`, error)
        smsResults.push({
          id: sms.id,
          phoneNumber: sms.phoneNumber,
          assigned: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    console.log("[Admin] Campaign auto-assignment complete")
    console.log(`[Admin] Email campaigns assigned: ${emailAssignedCount}/${unassignedCampaigns.length}`)
    console.log(`[Admin] SMS messages assigned: ${smsAssignedCount}/${unassignedSms.length}`)

    return NextResponse.json({
      success: true,
      summary: {
        email: {
          totalProcessed: unassignedCampaigns.length,
          assigned: emailAssignedCount,
        },
        sms: {
          totalProcessed: unassignedSms.length,
          assigned: smsAssignedCount,
        },
      },
      results: {
        email: emailResults.slice(0, 25),
        sms: smsResults.slice(0, 25),
      },
    })
  } catch (error) {
    console.error("[Admin] Error in campaign auto-assignment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * Match a campaign's CTA links to an entity based on donation identifiers
 */
async function matchCampaignToEntity(
  ctaLinks: any,
  entityIdentifiers: Map<
    string,
    {
      id: string
      name: string
      winred: string[]
      anedot: string[]
      psq: string[]
      actblue: string[]
    }
  >,
): Promise<{ entityId: string; entityName: string; method: string } | null> {
  if (!ctaLinks) return null

  const links = Array.isArray(ctaLinks) ? ctaLinks : []
  if (links.length === 0) return null

  // Extract donation identifiers from CTA links
  const donationIdentifiers = {
    winred: new Set<string>(),
    anedot: new Set<string>(),
    psq: new Set<string>(),
    actblue: new Set<string>(),
  }

  for (const link of links) {
    const urlToCheck = (link?.finalUrl || link?.url || link).toLowerCase()

    // Extract WinRed identifiers
    extractWinRedIdentifiers(urlToCheck, donationIdentifiers.winred)

    // Extract Anedot identifiers
    extractAnedotIdentifiers(urlToCheck, donationIdentifiers.anedot)

    // Extract PSQ identifiers
    extractPSQIdentifiers(urlToCheck, donationIdentifiers.psq)

    // Extract ActBlue identifiers
    const actblueMatch = urlToCheck.match(/secure\.actblue\.com\/donate\/([^/?]+)/i)
    if (actblueMatch) {
      donationIdentifiers.actblue.add(actblueMatch[1].toLowerCase())
    }
  }

  // If no identifiers found, return null
  if (
    donationIdentifiers.winred.size === 0 &&
    donationIdentifiers.anedot.size === 0 &&
    donationIdentifiers.psq.size === 0 &&
    donationIdentifiers.actblue.size === 0
  ) {
    return null
  }

  // Match against entities
  for (const [entityId, entity] of entityIdentifiers.entries()) {
    // Check WinRed
    for (const identifier of donationIdentifiers.winred) {
      if (entity.winred.includes(identifier)) {
        return { entityId, entityName: entity.name, method: "auto_winred" }
      }
    }

    // Check Anedot
    for (const identifier of donationIdentifiers.anedot) {
      if (entity.anedot.includes(identifier)) {
        return { entityId, entityName: entity.name, method: "auto_anedot" }
      }
    }

    // Check PSQ
    for (const identifier of donationIdentifiers.psq) {
      if (entity.psq.includes(identifier)) {
        return { entityId, entityName: entity.name, method: "auto_psq" }
      }
    }

    // Check ActBlue
    for (const identifier of donationIdentifiers.actblue) {
      if (entity.actblue.includes(identifier)) {
        return { entityId, entityName: entity.name, method: "auto_actblue" }
      }
    }
  }

  return null
}
