import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuth } from "@/lib/auth"
import { sanitizeEmailContent } from "@/lib/competitive-insights-utils"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(req: Request) {
  try {
    const authResult = await verifyAuth(req)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { campaignId } = body

    // Fetch seed emails for sanitization context
    const seedEmailRows = await sql`SELECT email FROM "SeedEmail" WHERE active = true`
    const seedEmails = seedEmailRows.map((r: { email: string }) => r.email)

    // If a specific campaign ID is provided, process only that one
    const campaigns = campaignId
      ? await sql`
          SELECT id, "emailContent"
          FROM "CompetitiveInsightCampaign"
          WHERE id = ${campaignId}
          AND "emailContent" IS NOT NULL
          AND "emailContent" != ''
        `
      : await sql`
          SELECT id, "emailContent"
          FROM "CompetitiveInsightCampaign"
          WHERE "emailContent" IS NOT NULL
          AND "emailContent" != ''
        `

    if (campaigns.length === 0) {
      return NextResponse.json({ error: "No campaigns found" }, { status: 404 })
    }

    let updated = 0
    let skipped = 0
    let errors = 0

    for (const campaign of campaigns) {
      try {
        const original = campaign.emailContent
        const sanitized = sanitizeEmailContent(original, seedEmails)

        if (sanitized !== original) {
          await sql`
            UPDATE "CompetitiveInsightCampaign"
            SET "emailContent" = ${sanitized}
            WHERE id = ${campaign.id}
          `
          updated++
        } else {
          skipped++
        }
      } catch (error) {
        console.error(`Error redacting links for campaign ${campaign.id}:`, error)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      summary: { total: campaigns.length, updated, skipped, errors },
    })
  } catch (error) {
    console.error("Error redacting email links:", error)
    return NextResponse.json({ error: "Failed to redact email links" }, { status: 500 })
  }
}
