import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const sql = neon(process.env.DATABASE_URL!)

    let emailsUpdated = 0
    let emailsSkipped = 0
    let emailLinksRemoved = 0
    let smsUpdated = 0
    let smsSkipped = 0
    let smsLinksRemoved = 0

    // ── Email campaigns ──────────────────────────────────────────────────────
    // Use Postgres jsonb path query to find only rows that actually contain
    // a "finalURL" key (uppercase) somewhere in the ctaLinks array.
    // This avoids loading every row in the table.
    const emailRows = await sql`
      SELECT id, "ctaLinks"
      FROM "CompetitiveInsightCampaign"
      WHERE "ctaLinks" IS NOT NULL
        AND "ctaLinks"::text ILIKE '%"finalURL"%'
    `

    console.log(`[remove-final-url-uppercase] Found ${emailRows.length} email campaigns containing "finalURL"`)

    for (const row of emailRows) {
      try {
        // ctaLinks is JSONB — Neon returns it already parsed
        let ctaLinks = row.ctaLinks
        if (typeof ctaLinks === "string") {
          ctaLinks = JSON.parse(ctaLinks)
        }

        if (!Array.isArray(ctaLinks)) {
          emailsSkipped++
          continue
        }

        let removed = 0
        const cleaned = ctaLinks.map((link: any) => {
          // Only remove the uppercase "finalURL" key.
          // "finalUrl" (camelCase), "strippedFinalUrl", "strippedFinalURL" are
          // handled separately — do NOT touch them here.
          if (Object.prototype.hasOwnProperty.call(link, "finalURL")) {
            const { finalURL, ...rest } = link
            removed++
            return rest
          }
          return link
        })

        if (removed === 0) {
          // ILIKE matched something else (e.g. inside a URL string), nothing to do
          emailsSkipped++
          continue
        }

        await sql`
          UPDATE "CompetitiveInsightCampaign"
          SET "ctaLinks" = ${JSON.stringify(cleaned)}::jsonb
          WHERE id = ${row.id}
        `

        emailLinksRemoved += removed
        emailsUpdated++
      } catch (err) {
        console.error(`[remove-final-url-uppercase] Error processing email ${row.id}:`, err)
        emailsSkipped++
      }
    }

    console.log(`[remove-final-url-uppercase] Emails done: ${emailsUpdated} updated, ${emailsSkipped} skipped, ${emailLinksRemoved} "finalURL" keys removed`)

    // ── SMS queue ────────────────────────────────────────────────────────────
    let smsRows: any[] = []
    try {
      smsRows = await sql`
        SELECT id, "ctaLinks"
        FROM "SmsQueue"
        WHERE "ctaLinks" IS NOT NULL
          AND "ctaLinks" != ''
          AND "ctaLinks" ILIKE '%"finalURL"%'
      `
      console.log(`[remove-final-url-uppercase] Found ${smsRows.length} SMS messages containing "finalURL"`)
    } catch (err) {
      console.error(`[remove-final-url-uppercase] Could not query SmsQueue:`, err)
    }

    for (const row of smsRows) {
      try {
        // SmsQueue.ctaLinks is stored as a plain string, not JSONB
        let ctaLinks: any[]
        try {
          ctaLinks = JSON.parse(row.ctaLinks as string)
        } catch {
          smsSkipped++
          continue
        }

        if (!Array.isArray(ctaLinks)) {
          smsSkipped++
          continue
        }

        let removed = 0
        const cleaned = ctaLinks.map((link: any) => {
          if (Object.prototype.hasOwnProperty.call(link, "finalURL")) {
            const { finalURL, ...rest } = link
            removed++
            return rest
          }
          return link
        })

        if (removed === 0) {
          smsSkipped++
          continue
        }

        await sql`
          UPDATE "SmsQueue"
          SET "ctaLinks" = ${JSON.stringify(cleaned)}
          WHERE id = ${row.id}
        `

        smsLinksRemoved += removed
        smsUpdated++
      } catch (err) {
        console.error(`[remove-final-url-uppercase] Error processing SMS ${row.id}:`, err)
        smsSkipped++
      }
    }

    console.log(`[remove-final-url-uppercase] SMS done: ${smsUpdated} updated, ${smsSkipped} skipped, ${smsLinksRemoved} "finalURL" keys removed`)

    return NextResponse.json({
      success: true,
      summary: {
        emailCampaignsUpdated: emailsUpdated,
        emailCampaignsSkipped: emailsSkipped,
        emailLinksRemoved,
        smsMessagesUpdated: smsUpdated,
        smsMessagesSkipped: smsSkipped,
        smsLinksRemoved,
        totalLinksRemoved: emailLinksRemoved + smsLinksRemoved,
      },
    })
  } catch (error: any) {
    console.error("[remove-final-url-uppercase] Fatal error:", error)
    return NextResponse.json(
      { success: false, error: error.message ?? "Unknown error" },
      { status: 500 },
    )
  }
}
