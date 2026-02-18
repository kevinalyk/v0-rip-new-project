import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { resolveRedirects, stripQueryParams } from "@/lib/competitive-insights-utils"
import { extractWinRedIdentifiers, extractAnedotIdentifiers, extractPSQIdentifiers } from "@/lib/ci-entity-utils"

export const maxDuration = 300 // 5 minutes

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[v0] Starting SMS auto-assignment process")

    // Step 1: Get all unassigned SMS messages
    const unassignedSms = await prisma.smsQueue.findMany({
      where: {
        entityId: null,
        processed: true,
      },
      orderBy: { createdAt: "desc" },
    })

    console.log(`[v0] Found ${unassignedSms.length} unassigned SMS messages`)

    let processedCount = 0
    let unwrappedCount = 0
    let assignedCount = 0
    const results: Array<{
      id: string
      phoneNumber: string | null
      originalUrl?: string
      unwrappedUrl?: string
      assigned: boolean
      entityName?: string
      error?: string
    }> = []

    // Step 2: Process each SMS
    for (const sms of unassignedSms) {
      try {
        processedCount++
        console.log(`[v0] Processing SMS ${processedCount}/${unassignedSms.length}: ${sms.id}`)

        // Parse CTA links if they exist
        let ctaLinks: Array<{ url: string; finalUrl?: string; type: string }> = []
        if (sms.ctaLinks) {
          try {
            ctaLinks = JSON.parse(sms.ctaLinks)
          } catch (e) {
            console.error(`[v0] Error parsing CTA links for SMS ${sms.id}:`, e)
          }
        }

        // If no CTA links, skip this SMS
        if (ctaLinks.length === 0) {
          results.push({
            id: sms.id,
            phoneNumber: sms.phoneNumber,
            assigned: false,
            error: "No CTA links found",
          })
          continue
        }

        // Step 3: Try to unwrap each CTA link
        let needsUpdate = false
        for (let i = 0; i < ctaLinks.length; i++) {
          const link = ctaLinks[i]
          const originalUrl = link.finalUrl || link.url

          // Skip if already unwrapped (has finalUrl)
          if (link.finalUrl && link.finalUrl !== link.url) {
            console.log(`[v0] Link already unwrapped: ${link.finalUrl}`)
            continue
          }

          try {
            console.log(`[v0] Attempting to unwrap: ${originalUrl}`)
            const unwrappedUrl = await resolveRedirects(originalUrl)

            if (unwrappedUrl !== originalUrl) {
              console.log(`[v0] Successfully unwrapped: ${originalUrl} → ${unwrappedUrl}`)
              ctaLinks[i].finalUrl = unwrappedUrl
              needsUpdate = true
              unwrappedCount++
            }
          } catch (error) {
            console.error(`[v0] Error unwrapping ${originalUrl}:`, error)
            // Keep original URL if unwrapping fails
          }
        }

        // Step 4: Update SMS with unwrapped URLs if changed
        if (needsUpdate) {
          await prisma.smsQueue.update({
            where: { id: sms.id },
            data: { ctaLinks: JSON.stringify(ctaLinks) },
          })
        }

        // Step 5: Try to auto-assign based on donation identifiers
        const donationIdentifiers = {
          winred: new Set<string>(),
          anedot: new Set<string>(),
          psq: new Set<string>(),
        }

        for (const link of ctaLinks) {
          const urlToCheck = link.finalUrl || link.url
          const strippedUrl = stripQueryParams(urlToCheck)

          // Extract identifiers from the URL
          extractWinRedIdentifiers(strippedUrl, donationIdentifiers.winred)
          extractAnedotIdentifiers(strippedUrl, donationIdentifiers.anedot)
          extractPSQIdentifiers(strippedUrl, donationIdentifiers.psq)
        }

        console.log(`[v0] Extracted donation identifiers:`, {
          winred: Array.from(donationIdentifiers.winred),
          anedot: Array.from(donationIdentifiers.anedot),
          psq: Array.from(donationIdentifiers.psq),
        })

        // If no identifiers found, skip assignment
        if (
          donationIdentifiers.winred.size === 0 &&
          donationIdentifiers.anedot.size === 0 &&
          donationIdentifiers.psq.size === 0
        ) {
          results.push({
            id: sms.id,
            phoneNumber: sms.phoneNumber,
            originalUrl: ctaLinks[0]?.url,
            unwrappedUrl: ctaLinks[0]?.finalUrl,
            assigned: false,
            error: "No donation identifiers found",
          })
          continue
        }

        // Step 6: Find matching entity
        const entities = await prisma.ciEntity.findMany({
          where: {
            donationIdentifiers: { not: null },
            type: { not: "data_broker" },
          },
        })

        let matchedEntity: { id: string; name: string; method: string } | null = null

        for (const entity of entities) {
          let identifiers: any = {}
          if (entity.donationIdentifiers) {
            if (typeof entity.donationIdentifiers === "string") {
              try {
                identifiers = JSON.parse(entity.donationIdentifiers)
              } catch (e) {
                console.error(`[v0] Error parsing donation identifiers for entity ${entity.id}:`, e)
                continue
              }
            } else {
              identifiers = entity.donationIdentifiers
            }
          }

          // Check WinRed identifiers
          if (identifiers.winred && Array.isArray(identifiers.winred)) {
            for (const identifier of donationIdentifiers.winred) {
              if (identifiers.winred.includes(identifier)) {
                matchedEntity = { id: entity.id, name: entity.name, method: "auto_winred" }
                break
              }
            }
          }

          // Check Anedot identifiers
          if (!matchedEntity && identifiers.anedot && Array.isArray(identifiers.anedot)) {
            for (const identifier of donationIdentifiers.anedot) {
              if (identifiers.anedot.includes(identifier)) {
                matchedEntity = { id: entity.id, name: entity.name, method: "auto_anedot" }
                break
              }
            }
          }

          // Check PSQ identifiers
          if (!matchedEntity && identifiers.psq && Array.isArray(identifiers.psq)) {
            for (const identifier of donationIdentifiers.psq) {
              if (identifiers.psq.includes(identifier)) {
                matchedEntity = { id: entity.id, name: entity.name, method: "auto_psq" }
                break
              }
            }
          }

          if (matchedEntity) break
        }

        // Step 7: Assign SMS to entity if match found
        if (matchedEntity) {
          await prisma.smsQueue.update({
            where: { id: sms.id },
            data: {
              entityId: matchedEntity.id,
              assignmentMethod: matchedEntity.method,
              assignedAt: new Date(),
            },
          })

          assignedCount++
          console.log(`[v0] Assigned SMS ${sms.id} to entity ${matchedEntity.name} via ${matchedEntity.method}`)

          results.push({
            id: sms.id,
            phoneNumber: sms.phoneNumber,
            originalUrl: ctaLinks[0]?.url,
            unwrappedUrl: ctaLinks[0]?.finalUrl,
            assigned: true,
            entityName: matchedEntity.name,
          })
        } else {
          results.push({
            id: sms.id,
            phoneNumber: sms.phoneNumber,
            originalUrl: ctaLinks[0]?.url,
            unwrappedUrl: ctaLinks[0]?.finalUrl,
            assigned: false,
            error: "No matching entity found",
          })
        }
      } catch (error) {
        console.error(`[v0] Error processing SMS ${sms.id}:`, error)
        results.push({
          id: sms.id,
          phoneNumber: sms.phoneNumber,
          assigned: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    console.log("[v0] SMS auto-assignment complete")
    console.log(`[v0] Processed: ${processedCount}, Unwrapped: ${unwrappedCount}, Assigned: ${assignedCount}`)

    return NextResponse.json({
      success: true,
      summary: {
        totalProcessed: processedCount,
        urlsUnwrapped: unwrappedCount,
        smsAssigned: assignedCount,
      },
      results,
    })
  } catch (error) {
    console.error("[v0] Error in SMS auto-assignment:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
