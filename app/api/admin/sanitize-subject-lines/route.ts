import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sanitizeSubject } from "@/lib/campaign-detector"

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[Admin] Starting subject line sanitization...")

    // Get all seed emails
    const seedEmails = await prisma.seedEmail.findMany({
      select: {
        email: true,
      },
    })

    const seedEmailAddresses = seedEmails.map((s) => s.email)
    console.log(`[Admin] Found ${seedEmailAddresses.length} seed emails to sanitize`)

    // Process in batches
    const BATCH_SIZE = 100
    let processedCount = 0
    let updatedCount = 0
    let errorCount = 0
    let hasMore = true
    let lastId = ""

    while (hasMore) {
      const whereClause: any = {}

      if (lastId) {
        whereClause.id = { gt: lastId }
      }

      // Fetch batch of campaigns
      const campaigns = await prisma.competitiveInsightCampaign.findMany({
        where: whereClause,
        take: BATCH_SIZE,
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
          subject: true,
        },
      })

      if (campaigns.length === 0) {
        hasMore = false
        break
      }

      // Process each campaign
      for (const campaign of campaigns) {
        try {
          processedCount++

          if (campaign.subject && campaign.subject.trim() !== "") {
            // Sanitize the subject
            const sanitizedSubject = sanitizeSubject(campaign.subject, seedEmailAddresses)

            // Only update if the subject changed
            if (sanitizedSubject !== campaign.subject) {
              await prisma.competitiveInsightCampaign.update({
                where: { id: campaign.id },
                data: {
                  subject: sanitizedSubject,
                },
              })

              updatedCount++
            }
          }
        } catch (error) {
          errorCount++
          console.error(`[Admin] Error processing campaign ${campaign.id}:`, error)
        }
      }

      // Update lastId for next batch
      lastId = campaigns[campaigns.length - 1].id

      // Log progress every 100 records
      if (processedCount % 100 === 0) {
        console.log(`[Admin] Progress: ${processedCount} processed, ${updatedCount} updated`)
      }
    }

    console.log(
      `[Admin] Subject sanitization complete: ${processedCount} processed, ${updatedCount} updated, ${errorCount} errors`,
    )

    return NextResponse.json({
      success: true,
      summary: {
        processed: processedCount,
        updated: updatedCount,
        skipped: processedCount - updatedCount - errorCount,
        errors: errorCount,
      },
    })
  } catch (error) {
    console.error("[Admin] Subject sanitization error:", error)
    return NextResponse.json(
      { error: "Failed to sanitize subject lines", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
