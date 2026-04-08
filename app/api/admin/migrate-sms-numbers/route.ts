import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 minutes for large datasets

export async function POST() {
  try {
    console.log("[SMS Migration] Starting migration of toNumber fields...")

    // Fetch all SMS records
    const allSms = await prisma.smsQueue.findMany({
      select: {
        id: true,
        rawData: true,
        toNumber: true,
      },
    })

    console.log(`[SMS Migration] Found ${allSms.length} SMS records to process`)

    let updated = 0
    let skipped = 0
    let errors = 0

    for (const sms of allSms) {
      try {
        // Parse rawData (it's a JSON string) to extract the phone_number (the receiving number)
        let rawData: any
        if (typeof sms.rawData === "string") {
          rawData = JSON.parse(sms.rawData)
        } else {
          rawData = sms.rawData
        }

        const correctToNumber = rawData?.phone_number

        if (!correctToNumber) {
          console.log(`[SMS Migration] Skipping ${sms.id} - no phone_number in rawData`)
          skipped++
          continue
        }

        // Only update if the toNumber is different
        if (sms.toNumber !== correctToNumber) {
          await prisma.smsQueue.update({
            where: { id: sms.id },
            data: { toNumber: correctToNumber },
          })
          updated++

          if (updated % 100 === 0) {
            console.log(`[SMS Migration] Progress: ${updated} updated so far...`)
          }
        } else {
          skipped++
        }
      } catch (err) {
        console.error(`[SMS Migration] Error processing SMS ${sms.id}:`, err)
        errors++
      }
    }

    const summary = {
      total: allSms.length,
      updated,
      skipped,
      errors,
    }

    console.log("[SMS Migration] Complete:", summary)

    return NextResponse.json({
      success: true,
      message: "Migration complete",
      ...summary,
    })
  } catch (error) {
    console.error("[SMS Migration] Failed:", error)
    return NextResponse.json(
      { success: false, error: "Migration failed" },
      { status: 500 }
    )
  }
}
