import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"
import type { DonationIdentifiers } from "@/lib/ci-entity-utils"

const prisma = new PrismaClient()

/**
 * Extract donation platform identifiers from CTA links
 * Returns: { platform: "winred" | "anedot", identifier: "nrcc" }
 */
function extractDonationIdentifiers(ctaLinks: any): Array<{ platform: string; identifier: string }> {
  if (!ctaLinks) return []

  const identifiers: Array<{ platform: string; identifier: string }> = []
  const links = Array.isArray(ctaLinks) ? ctaLinks : []

  for (const link of links) {
    const urlToCheck = typeof link === "string" ? link : link?.finalUrl || link?.url
    if (!urlToCheck) continue

    // Match WinRed URLs: secure.winred.com/{identifier}/...
    const winredMatch = urlToCheck.match(/secure\.winred\.com\/([^/?]+)/i)
    if (winredMatch) {
      identifiers.push({ platform: "winred", identifier: winredMatch[1].toLowerCase() })
      continue
    }

    // Match Anedot URLs: secure.anedot.com/{identifier}/...
    const anedotMatch = urlToCheck.match(/secure\.anedot\.com\/([^/?]+)/i)
    if (anedotMatch) {
      identifiers.push({ platform: "anedot", identifier: anedotMatch[1].toLowerCase() })
      continue
    }
  }

  return identifiers
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[Admin] Starting donation identifier auto-population...")

    // Get all Republican entities that are not data brokers
    const entities = await prisma.ciEntity.findMany({
      where: {
        party: {
          equals: "Republican",
          mode: "insensitive",
        },
        type: {
          not: "data_broker",
        },
      },
      select: {
        id: true,
        name: true,
        donationIdentifiers: true,
      },
    })

    console.log(`[Admin] Found ${entities.length} Republican entities (excluding data brokers)`)

    let updated = 0
    let skipped = 0
    let errors = 0

    const results: Array<{ entityName: string; identifiers: Record<string, string[]>; status: string }> = []

    for (const entity of entities) {
      try {
        // Get all campaigns for this entity (both email and SMS)
        const [campaigns, smsMessages] = await Promise.all([
          prisma.competitiveInsightCampaign.findMany({
            where: { entityId: entity.id },
            select: { ctaLinks: true },
          }),
          prisma.smsQueue.findMany({
            where: { entityId: entity.id },
            select: { ctaLinks: true },
          }),
        ])

        const platformIdentifiers: Record<string, Set<string>> = {
          winred: new Set(),
          anedot: new Set(),
        }

        // Process email campaigns
        for (const campaign of campaigns) {
          const identifiers = extractDonationIdentifiers(campaign.ctaLinks)
          identifiers.forEach(({ platform, identifier }) => {
            if (!platformIdentifiers[platform]) {
              platformIdentifiers[platform] = new Set()
            }
            platformIdentifiers[platform].add(identifier)
          })
        }

        // Process SMS messages
        for (const sms of smsMessages) {
          let parsedLinks
          try {
            parsedLinks = sms.ctaLinks ? JSON.parse(sms.ctaLinks) : null
          } catch {
            parsedLinks = sms.ctaLinks
          }

          const identifiers = extractDonationIdentifiers(parsedLinks)
          identifiers.forEach(({ platform, identifier }) => {
            if (!platformIdentifiers[platform]) {
              platformIdentifiers[platform] = new Set()
            }
            platformIdentifiers[platform].add(identifier)
          })
        }

        // Check if any identifiers were found
        const totalIdentifiers = Object.values(platformIdentifiers).reduce((sum, set) => sum + set.size, 0)

        if (totalIdentifiers === 0) {
          console.log(`[Admin] No donation identifiers found for ${entity.name}`)
          skipped++
          results.push({
            entityName: entity.name,
            identifiers: {},
            status: "No donation URLs found",
          })
          continue
        }

        let existingIdentifiers: DonationIdentifiers = {}
        try {
          if (entity.donationIdentifiers) {
            existingIdentifiers =
              typeof entity.donationIdentifiers === "string"
                ? JSON.parse(entity.donationIdentifiers)
                : entity.donationIdentifiers
          }
        } catch (error) {
          console.error(`Error parsing existing identifiers for ${entity.name}:`, error)
          existingIdentifiers = {}
        }

        // Merge new identifiers with existing ones
        let hasNewIdentifiers = false
        const mergedIdentifiers: DonationIdentifiers = { ...existingIdentifiers }

        for (const [platform, identifierSet] of Object.entries(platformIdentifiers)) {
          if (identifierSet.size === 0) continue

          const newIdentifiers = Array.from(identifierSet)
          const existingPlatformIdentifiers = mergedIdentifiers[platform as keyof DonationIdentifiers] || []

          const uniqueNewIdentifiers = newIdentifiers.filter((id) => !existingPlatformIdentifiers.includes(id))

          if (uniqueNewIdentifiers.length > 0) {
            mergedIdentifiers[platform as keyof DonationIdentifiers] = [
              ...existingPlatformIdentifiers,
              ...uniqueNewIdentifiers,
            ]
            hasNewIdentifiers = true
          }
        }

        if (!hasNewIdentifiers) {
          console.log(`[Admin] ${entity.name} already has all identifiers`)
          skipped++
          const displayIdentifiers: Record<string, string[]> = {}
          for (const [platform, identifierSet] of Object.entries(platformIdentifiers)) {
            if (identifierSet.size > 0) {
              displayIdentifiers[platform] = Array.from(identifierSet)
            }
          }
          results.push({
            entityName: entity.name,
            identifiers: displayIdentifiers,
            status: "Already up to date",
          })
          continue
        }

        await prisma.ciEntity.update({
          where: { id: entity.id },
          data: { donationIdentifiers: mergedIdentifiers as any },
        })

        const displayIdentifiers: Record<string, string[]> = {}
        for (const [platform, identifierSet] of Object.entries(platformIdentifiers)) {
          if (identifierSet.size > 0) {
            displayIdentifiers[platform] = Array.from(identifierSet)
          }
        }

        console.log(`[Admin] Updated ${entity.name} with identifiers:`, displayIdentifiers)
        updated++
        results.push({
          entityName: entity.name,
          identifiers: displayIdentifiers,
          status: `Updated with ${Object.keys(displayIdentifiers).length} platform(s)`,
        })
      } catch (error) {
        console.error(`[Admin] Error processing ${entity.name}:`, error)
        errors++
        results.push({
          entityName: entity.name,
          identifiers: {},
          status: "Error processing entity",
        })
      }
    }

    console.log(
      `[Admin] Donation identifier auto-population complete: ${updated} updated, ${skipped} skipped, ${errors} errors`,
    )

    return NextResponse.json({
      message: "Donation identifier auto-population completed",
      summary: { updated, skipped, errors },
      results: results.slice(0, 50), // Return first 50 results for preview
    })
  } catch (error) {
    console.error("[Admin] Error in donation identifier auto-population:", error)
    return NextResponse.json({ error: "Failed to auto-populate donation identifiers" }, { status: 500 })
  }
}
