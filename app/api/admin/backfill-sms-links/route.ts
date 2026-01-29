import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { neon } from "@neondatabase/serverless"
import { extractLinksFromText } from "@/lib/sms-link-extractor"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(req: Request) {
  try {
    const authResult = await verifyAuth(req)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    // Fetch all SMS messages that don't have ctaLinks yet
    const smsMessages = await sql`
      SELECT id, message
      FROM "SmsQueue"
      WHERE message IS NOT NULL
      AND ("ctaLinks" IS NULL OR "ctaLinks" = '[]'::jsonb)
    `

    let updated = 0
    let skipped = 0
    let errors = 0
    const results = []

    for (const sms of smsMessages) {
      try {
        const messageBody = sms.message

        if (!messageBody || typeof messageBody !== "string") {
          skipped++
          results.push({
            id: sms.id,
            status: "skipped",
            reason: "No message body",
          })
          continue
        }

        // Extract links from the message text
        const ctaLinks = await extractLinksFromText(messageBody)

        if (ctaLinks.length === 0) {
          skipped++
          results.push({
            id: sms.id,
            status: "skipped",
            reason: "No links found",
          })
          continue
        }

        // Update the SMS message with extracted CTA links
        await sql`
          UPDATE "SmsQueue"
          SET "ctaLinks" = ${JSON.stringify(ctaLinks)}::jsonb
          WHERE id = ${sms.id}
        `

        updated++
        results.push({
          id: sms.id,
          status: "updated",
          linksFound: ctaLinks.length,
          links: ctaLinks.map((link) => link.url),
        })
      } catch (error) {
        console.error(`Error processing SMS ${sms.id}:`, error)
        errors++
        results.push({
          id: sms.id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      success: true,
      message: "SMS CTA links backfill completed",
      summary: {
        total: smsMessages.length,
        updated,
        skipped,
        errors,
      },
      results,
    })
  } catch (error) {
    console.error("Backfill error:", error)
    return NextResponse.json(
      {
        error: "Failed to run SMS CTA links backfill",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
