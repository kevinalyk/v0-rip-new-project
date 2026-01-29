import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Helper function to strip query parameters from URLs
function stripQueryParams(url: string): string {
  try {
    const urlObj = new URL(url)
    return `${urlObj.origin}${urlObj.pathname}`
  } catch {
    // If URL parsing fails, try to manually strip after ?
    const questionMarkIndex = url.indexOf("?")
    return questionMarkIndex !== -1 ? url.substring(0, questionMarkIndex) : url
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    let emailsUpdated = 0
    let smsUpdated = 0
    let emailsSkipped = 0
    let smsSkipped = 0

    const emailIds = await sql`
      SELECT id
      FROM "CompetitiveInsightCampaign"
      WHERE "ctaLinks" IS NOT NULL
    `

    console.log(`[v0] Processing ${emailIds.length} email campaigns...`)

    const debugLimit = Math.min(5, emailIds.length)

    for (let i = 0; i < debugLimit; i++) {
      const { id } = emailIds[i]

      console.log(`[v0] ===== Processing campaign ${i + 1}/${debugLimit}: ${id} =====`)

      try {
        const [campaign] = await sql`
          SELECT id, "ctaLinks"
          FROM "CompetitiveInsightCampaign"
          WHERE id = ${id}
        `

        console.log(`[v0] Campaign fetched:`, campaign ? "found" : "not found")

        if (!campaign || !campaign.ctaLinks) {
          console.log(`[v0] Skipping - no campaign or no ctaLinks`)
          emailsSkipped++
          continue
        }

        console.log(`[v0] ctaLinks type:`, typeof campaign.ctaLinks)
        console.log(`[v0] ctaLinks isArray:`, Array.isArray(campaign.ctaLinks))
        console.log(`[v0] ctaLinks length:`, Array.isArray(campaign.ctaLinks) ? campaign.ctaLinks.length : "N/A")

        let ctaLinks = campaign.ctaLinks
        if (typeof ctaLinks === "string") {
          try {
            ctaLinks = JSON.parse(ctaLinks)
            console.log(`[v0] Parsed ctaLinks from string to object`)
          } catch (error) {
            console.log(`[v0] Failed to parse ctaLinks JSON:`, error)
            emailsSkipped++
            continue
          }
        }

        const hasQueryParams = ctaLinks.some(
          (link: any) => (link.url && link.url.includes("?")) || (link.finalUrl && link.finalUrl.includes("?")),
        )

        console.log(`[v0] hasQueryParams:`, hasQueryParams)

        if (!hasQueryParams) {
          console.log(`[v0] Skipping - no query params found`)
          emailsSkipped++
          continue
        }

        const cleanedLinks = ctaLinks.map((link: any) => {
          const cleanedLink = { ...link }

          // Strip params from url field
          if (link.url && typeof link.url === "string") {
            const cleaned = stripQueryParams(link.url)
            console.log(`[v0] Cleaning url: ${link.url.substring(0, 100)}... -> ${cleaned.substring(0, 100)}...`)
            cleanedLink.url = cleaned
          }

          // Strip params from finalUrl field
          if (link.finalUrl && typeof link.finalUrl === "string") {
            const cleaned = stripQueryParams(link.finalUrl)
            console.log(
              `[v0] Cleaning finalUrl: ${link.finalUrl.substring(0, 100)}... -> ${cleaned.substring(0, 100)}...`,
            )
            cleanedLink.finalUrl = cleaned
          }

          return cleanedLink
        })

        console.log(`[v0] Attempting to update campaign ${id}`)

        // Update the campaign
        await sql`
          UPDATE "CompetitiveInsightCampaign"
          SET "ctaLinks" = ${JSON.stringify(cleanedLinks)}::jsonb
          WHERE id = ${id}
        `

        console.log(`[v0] Successfully updated campaign ${id}`)
        emailsUpdated++
      } catch (error) {
        console.error(`[v0] Error processing email ${id}:`, error)
        emailsSkipped++
        continue
      }
    }

    console.log(
      `[v0] Debug complete. Now processing remaining ${emailIds.length - debugLimit} campaigns without debug logging...`,
    )

    for (let i = debugLimit; i < emailIds.length; i++) {
      const { id } = emailIds[i]

      if (i > 0 && i % 100 === 0) {
        console.log(`Processed ${i}/${emailIds.length} emails`)
      }

      try {
        const [campaign] = await sql`
          SELECT id, "ctaLinks"
          FROM "CompetitiveInsightCampaign"
          WHERE id = ${id}
        `

        if (!campaign || !campaign.ctaLinks) {
          emailsSkipped++
          continue
        }

        let ctaLinks = campaign.ctaLinks
        if (typeof ctaLinks === "string") {
          try {
            ctaLinks = JSON.parse(ctaLinks)
          } catch (error) {
            emailsSkipped++
            continue
          }
        }

        const hasQueryParams = ctaLinks.some(
          (link: any) => (link.url && link.url.includes("?")) || (link.finalUrl && link.finalUrl.includes("?")),
        )

        if (!hasQueryParams) {
          emailsSkipped++
          continue
        }

        const cleanedLinks = ctaLinks.map((link: any) => {
          const cleanedLink = { ...link }

          if (link.url && typeof link.url === "string") {
            cleanedLink.url = stripQueryParams(link.url)
          }

          if (link.finalUrl && typeof link.finalUrl === "string") {
            cleanedLink.finalUrl = stripQueryParams(link.finalUrl)
          }

          return cleanedLink
        })

        await sql`
          UPDATE "CompetitiveInsightCampaign"
          SET "ctaLinks" = ${JSON.stringify(cleanedLinks)}::jsonb
          WHERE id = ${id}
        `

        emailsUpdated++
      } catch (error) {
        console.error(`Error processing email ${id}:`, error)
        emailsSkipped++
        continue
      }
    }

    console.log(`Finished emails: ${emailsUpdated} updated, ${emailsSkipped} skipped`)

    let smsIds: any[] = []
    try {
      smsIds = await sql`
        SELECT id
        FROM "SmsQueue"
        WHERE "ctaLinks" IS NOT NULL
        AND "ctaLinks" != ''
      `
      console.log(`Processing ${smsIds.length} SMS messages...`)
    } catch (error) {
      console.log(
        `Warning: Could not fetch SMS IDs, skipping SMS processing. Error: ${error instanceof Error ? error.message : String(error)}`,
      )
      // Continue to return results for emails even if SMS fails
      return NextResponse.json({
        success: true,
        summary: {
          emailCampaignsUpdated: emailsUpdated,
          emailCampaignsSkipped: emailsSkipped,
          smsMessagesUpdated: 0,
          smsMessagesSkipped: 0,
          totalUpdated: emailsUpdated,
          warning: "SMS processing skipped due to database errors",
        },
      })
    }

    // Process each SMS individually with error handling
    for (let i = 0; i < smsIds.length; i++) {
      const { id } = smsIds[i]

      // Log progress every 100 records
      if (i > 0 && i % 100 === 0) {
        console.log(`Processed ${i}/${smsIds.length} SMS`)
      }

      try {
        const [sms] = await sql`
          SELECT id, "ctaLinks"
          FROM "SmsQueue"
          WHERE id = ${id}
        `

        if (!sms || !sms.ctaLinks) {
          smsSkipped++
          continue
        }

        // Parse the ctaLinks string (SMS stores as string, not JSONB)
        const ctaLinks = JSON.parse(sms.ctaLinks as string)

        // Skip if not an array or empty
        if (!Array.isArray(ctaLinks) || ctaLinks.length === 0) {
          smsSkipped++
          continue
        }

        const hasQueryParams = ctaLinks.some(
          (link: any) => (link.url && link.url.includes("?")) || (link.finalUrl && link.finalUrl.includes("?")),
        )

        if (!hasQueryParams) {
          smsSkipped++
          continue
        }

        const cleanedLinks = ctaLinks.map((link: any) => {
          const cleanedLink = { ...link }

          // Strip params from url field
          if (link.url && typeof link.url === "string") {
            cleanedLink.url = stripQueryParams(link.url)
          }

          // Strip params from finalUrl field
          if (link.finalUrl && typeof link.finalUrl === "string") {
            cleanedLink.finalUrl = stripQueryParams(link.finalUrl)
          }

          return cleanedLink
        })

        // Update the SMS
        await sql`
          UPDATE "SmsQueue"
          SET "ctaLinks" = ${JSON.stringify(cleanedLinks)}
          WHERE id = ${id}
        `

        smsUpdated++
      } catch (error) {
        console.error(`Error processing SMS ${id}:`, error)
        smsSkipped++
        continue
      }
    }

    console.log(`Finished SMS: ${smsUpdated} updated, ${smsSkipped} skipped`)

    return NextResponse.json({
      success: true,
      summary: {
        emailCampaignsUpdated: emailsUpdated,
        emailCampaignsSkipped: emailsSkipped,
        smsMessagesUpdated: smsUpdated,
        smsMessagesSkipped: smsSkipped,
        totalUpdated: emailsUpdated + smsUpdated,
      },
    })
  } catch (error) {
    console.error("Error cleaning CTA parameters:", error)
    return NextResponse.json(
      {
        error: "Failed to clean CTA parameters",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
