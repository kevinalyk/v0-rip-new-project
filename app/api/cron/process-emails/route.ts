import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { processEmail } from "@/lib/email-processor"

export const runtime = "nodejs"

// This endpoint will be called by a cron job (e.g., Vercel Cron)
export async function GET(request: Request) {
  try {
    console.log("Starting email processing job")

    // Get unprocessed emails from the queue
    const unprocessedEmails = await prisma.emailQueue.findMany({
      where: {
        processed: false,
        processingAttempts: { lt: 3 }, // Limit retry attempts
      },
      orderBy: { createdAt: "asc" },
      take: 10, // Process in batches
    })

    console.log(`Found ${unprocessedEmails.length} emails to process`)

    if (unprocessedEmails.length === 0) {
      return NextResponse.json({ success: true, message: "No emails to process" })
    }

    // Process each email
    const results = []
    for (const email of unprocessedEmails) {
      try {
        // Update processing attempts
        await prisma.emailQueue.update({
          where: { id: email.id },
          data: { processingAttempts: { increment: 1 } },
        })

        // Process the email
        const result = await processEmail(email)
        results.push(result)

        // Mark as processed
        await prisma.emailQueue.update({
          where: { id: email.id },
          data: {
            processed: true,
            processedAt: new Date(),
          },
        })
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error)

        // Update the error message
        await prisma.emailQueue.update({
          where: { id: email.id },
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        })

        results.push({ id: email.id, success: false, error: String(error) })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    })
  } catch (error) {
    console.error("Error in email processing job:", error)
    return NextResponse.json(
      { error: "Failed to process emails", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
