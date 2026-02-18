import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { neon } from "@neondatabase/serverless"

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

    console.log("[v0] Starting SMS gateway migration...")

    const smsMessages = await sql`
      SELECT id, "phoneNumber", message
      FROM "SmsQueue"
      WHERE (
        "phoneNumber" LIKE '1763257%' 
        OR "phoneNumber" LIKE '+1763257%'
        OR "phoneNumber" = '5417204415'
        OR "phoneNumber" = '+15417204415'
        OR "phoneNumber" = '15417204415'
      )
      AND message IS NOT NULL
    `

    console.log(`[v0] Found ${smsMessages.length} SMS messages to migrate`)

    let updated = 0
    let skipped = 0
    let errors = 0
    const results = []

    for (const sms of smsMessages) {
      try {
        const messageBody = sms.message

        if (!messageBody || typeof messageBody !== "string") {
          console.log(`[v0] Skipping SMS ${sms.id} - no message body`)
          skipped++
          results.push({
            id: sms.id,
            status: "skipped",
            reason: "No message body",
          })
          continue
        }

        // Check if message contains the pipe character
        if (!messageBody.includes("|")) {
          console.log(`[v0] Skipping SMS ${sms.id} - no pipe delimiter found`)
          skipped++
          results.push({
            id: sms.id,
            status: "skipped",
            reason: "No pipe delimiter",
          })
          continue
        }

        // Extract short code before the pipe
        const pipeIndex = messageBody.indexOf("|")
        const shortCode = messageBody.substring(0, pipeIndex).trim()
        const cleanedBody = messageBody.substring(pipeIndex + 1).trim()

        // Validate sender code format:
        // - Short code: 5-6 digits (e.g., "88022", "80810")
        // - Long code: +1 followed by 10 digits (e.g., "+17712445944")
        const isShortCode = /^\d{5,6}$/.test(shortCode)
        const isLongCodeWithPlus = /^\+1\d{10}$/.test(shortCode)

        if (!isShortCode && !isLongCodeWithPlus) {
          console.log(`[v0] Skipping SMS ${sms.id} - invalid sender format: ${shortCode}`)
          skipped++
          results.push({
            id: sms.id,
            status: "skipped",
            reason: `Invalid sender format: ${shortCode}`,
          })
          continue
        }

        // Remove the + prefix from long codes before storing
        const finalSender = isLongCodeWithPlus ? shortCode.substring(1) : shortCode

        console.log(`[v0] Updating SMS ${sms.id}:`)
        console.log(`   Old sender: ${sms.phoneNumber}`)
        console.log(`   New sender: ${finalSender}`)
        console.log(`   Cleaning message body...`)

        // Update the SMS message
        await sql`
          UPDATE "SmsQueue"
          SET 
            "phoneNumber" = ${finalSender},
            message = ${cleanedBody}
          WHERE id = ${sms.id}
        `

        updated++
        results.push({
          id: sms.id,
          status: "updated",
          oldSender: sms.phoneNumber,
          newSender: finalSender,
        })
      } catch (error) {
        console.error(`[v0] Error updating SMS ${sms.id}:`, error)
        errors++
        results.push({
          id: sms.id,
          status: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    console.log("[v0] Migration complete!")
    console.log(`   - Updated: ${updated} SMS messages`)
    console.log(`   - Skipped: ${skipped} SMS messages`)
    console.log(`   - Errors: ${errors} SMS messages`)

    return NextResponse.json({
      success: true,
      message: "SMS migration completed",
      summary: {
        total: smsMessages.length,
        updated,
        skipped,
        errors,
      },
      results,
    })
  } catch (error) {
    console.error("[v0] Migration error:", error)
    return NextResponse.json(
      {
        error: "Failed to run SMS migration",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
