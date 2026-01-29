import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)

    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    console.log("[Admin] Starting SMS 5417204415 fix...")

    // Find all SMS messages with phone number 5417204415
    const smsMessages = await prisma.smsQueue.findMany({
      where: {
        phoneNumber: "5417204415",
      },
      select: {
        id: true,
        message: true,
        phoneNumber: true,
      },
    })

    console.log(`[Admin] Found ${smsMessages.length} SMS messages to process`)

    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const sampleResults: Array<{
      id: string
      oldPhone: string
      newPhone: string
      oldMessage: string
      newMessage: string
    }> = []

    for (const sms of smsMessages) {
      try {
        // Parse the message format: "From: 40323 Message: ICYMI: 5 of GA's most..."
        const fromMatch = sms.message.match(/From:\s*(\d+)/i)
        const messageMatch = sms.message.match(/Message:\s*(.+)/is)

        if (fromMatch && messageMatch) {
          const realSender = fromMatch[1]
          const realMessage = messageMatch[1].trim()

          // Update the SMS record
          await prisma.smsQueue.update({
            where: { id: sms.id },
            data: {
              phoneNumber: realSender,
              message: realMessage,
            },
          })

          updatedCount++

          // Store sample for first 5 updates
          if (sampleResults.length < 5) {
            sampleResults.push({
              id: sms.id,
              oldPhone: sms.phoneNumber,
              newPhone: realSender,
              oldMessage: sms.message.substring(0, 100) + "...",
              newMessage: realMessage.substring(0, 100) + "...",
            })
          }
        } else {
          // Message doesn't match expected format
          skippedCount++
          console.log(`[Admin] Skipping SMS ${sms.id} - doesn't match format`)
        }
      } catch (error) {
        errorCount++
        console.error(`[Admin] Error processing SMS ${sms.id}:`, error)
      }
    }

    console.log(`[Admin] SMS fix complete: ${updatedCount} updated, ${skippedCount} skipped, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      summary: {
        total: smsMessages.length,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errorCount,
      },
      sampleResults,
    })
  } catch (error) {
    console.error("[Admin] SMS fix error:", error)
    return NextResponse.json(
      { error: "Failed to fix SMS messages", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
