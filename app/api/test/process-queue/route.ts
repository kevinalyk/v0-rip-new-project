import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { processEmail } from "@/lib/email-processor"
import { isAdmin } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    // Check if user is admin
    const isUserAdmin = await isAdmin(request)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 })
    }

    console.log("Manual email processing triggered")

    // Get unprocessed emails from the queue
    const unprocessedEmails = await prisma.emailQueue.findMany({
      where: {
        processed: false,
        processingAttempts: { lt: 3 },
      },
      orderBy: { createdAt: "asc" },
      take: 5, // Process 5 at a time for testing
    })

    console.log(`Found ${unprocessedEmails.length} emails to process`)

    if (unprocessedEmails.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No emails to process",
        processed: 0,
      })
    }

    // Process each email
    const results = []
    for (const email of unprocessedEmails) {
      try {
        console.log(`Processing email ${email.id}`)

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

        console.log(`Successfully processed email ${email.id}`)
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error)

        // Update the error message
        await prisma.emailQueue.update({
          where: { id: email.id },
          data: {
            error: error instanceof Error ? error.message : String(error),
          },
        })

        results.push({
          id: email.id,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    })
  } catch (error) {
    console.error("Error in manual email processing:", error)
    return NextResponse.json(
      {
        error: "Failed to process emails",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
