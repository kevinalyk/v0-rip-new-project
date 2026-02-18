import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    console.log("[v0] Sanitize emails API called")

    const authResult = await verifyAuth(request)
    console.log("[v0] Auth result:", { success: authResult.success, role: authResult.user?.role })

    if (!authResult.success || !authResult.user) {
      console.log("[v0] Auth failed - not authenticated or no user")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      console.log("[v0] Auth failed - role is not super_admin:", authResult.user.role)
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[v0] Auth successful - starting email sanitization process...")

    // Email regex pattern to find all email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/gi

    // Function to remove emails from text
    const removeEmails = (text: string | null): string | null => {
      if (!text) return text
      return text.replace(emailRegex, "[email removed]")
    }

    // Process in batches to avoid memory issues
    const BATCH_SIZE = 50
    let processedCount = 0
    let updatedCount = 0
    let errorCount = 0
    let hasMore = true
    let lastId = ""

    while (hasMore) {
      // Fetch batch of campaigns
      const campaigns = await prisma.competitiveInsightCampaign.findMany({
        where: lastId
          ? {
              id: {
                gt: lastId,
              },
            }
          : {},
        take: BATCH_SIZE,
        orderBy: {
          id: "asc",
        },
        select: {
          id: true,
          emailContent: true,
          emailPreview: true,
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

          // Check if campaign has emails in content
          const hasEmailInContent = campaign.emailContent && emailRegex.test(campaign.emailContent)
          const hasEmailInPreview = campaign.emailPreview && emailRegex.test(campaign.emailPreview)

          if (hasEmailInContent || hasEmailInPreview) {
            // Sanitize the content
            const sanitizedContent = removeEmails(campaign.emailContent)
            const sanitizedPreview = removeEmails(campaign.emailPreview)

            // Update the campaign
            await prisma.competitiveInsightCampaign.update({
              where: { id: campaign.id },
              data: {
                emailContent: sanitizedContent,
                emailPreview: sanitizedPreview,
              },
            })

            updatedCount++
            console.log(`[v0] Sanitized campaign ${campaign.id} (${updatedCount}/${processedCount})`)
          }

          // Reset regex lastIndex for next iteration
          emailRegex.lastIndex = 0
        } catch (error) {
          errorCount++
          console.error(`[v0] Error processing campaign ${campaign.id}:`, error)
        }
      }

      // Update lastId for next batch
      lastId = campaigns[campaigns.length - 1].id

      // Log progress
      console.log(`[v0] Progress: Processed ${processedCount}, Updated ${updatedCount}, Errors ${errorCount}`)
    }

    console.log("[v0] Email sanitization complete!")
    console.log(`[v0] Total processed: ${processedCount}`)
    console.log(`[v0] Total updated: ${updatedCount}`)
    console.log(`[v0] Total errors: ${errorCount}`)

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
    console.error("[v0] Email sanitization error:", error)
    return NextResponse.json(
      { error: "Failed to sanitize emails", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
