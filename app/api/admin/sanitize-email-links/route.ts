import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuth } from "@/lib/auth"
import { sanitizeEmailLinks } from "@/lib/competitive-insights-utils"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(req: Request) {
  try {
    const authResult = await verifyAuth(req)

    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Fetch all campaigns with emailContent
    const campaigns = await sql`
      SELECT id, "emailContent"
      FROM "CompetitiveInsightCampaign"
      WHERE "emailContent" IS NOT NULL
      AND "emailContent" != ''
    `

    let updated = 0
    let skipped = 0
    let errors = 0

    for (const campaign of campaigns) {
      try {
        const originalHtml = campaign.emailContent
        const sanitizedHtml = sanitizeEmailLinks(originalHtml)

        // Only update if content changed
        if (sanitizedHtml !== originalHtml) {
          await sql`
            UPDATE "CompetitiveInsightCampaign"
            SET "emailContent" = ${sanitizedHtml}
            WHERE id = ${campaign.id}
          `
          updated++
        } else {
          skipped++
        }
      } catch (error) {
        console.error(`Error sanitizing campaign ${campaign.id}:`, error)
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: campaigns.length,
        updated,
        skipped,
        errors,
      },
    })
  } catch (error) {
    console.error("Error sanitizing email links:", error)
    return NextResponse.json({ error: "Failed to sanitize email links" }, { status: 500 })
  }
}
