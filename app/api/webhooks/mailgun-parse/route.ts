import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { v4 as uuidv4 } from "uuid"
import crypto from "crypto"

// Verify Mailgun webhook signature
function verifyMailgunWebhook(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY

  if (!signingKey) {
    console.error("MAILGUN_WEBHOOK_SIGNING_KEY environment variable is not set")
    return false
  }

  const encodedToken = crypto.createHmac("sha256", signingKey).update(timestamp.concat(token)).digest("hex")

  return encodedToken === signature
}

export async function POST(request: Request) {
  try {
    console.log("Received Mailgun Parse webhook")

    // Parse the form data from Mailgun
    const formData = await request.formData()

    // Get signature verification data
    const timestamp = formData.get("timestamp") as string
    const token = formData.get("token") as string
    const signature = formData.get("signature") as string

    // Verify the webhook signature (if available)
    if (timestamp && token && signature) {
      if (!verifyMailgunWebhook(timestamp, token, signature)) {
        console.error("Invalid Mailgun webhook signature")
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    // Log the received data for debugging
    console.log("Mailgun Parse webhook data received:")
    const dataEntries = Object.fromEntries(formData.entries())
    console.log("Form data keys:", Object.keys(dataEntries))

    // Log key fields for debugging
    console.log("From:", dataEntries.from || dataEntries.From || dataEntries.sender)
    console.log("To:", dataEntries.to || dataEntries.To || dataEntries.recipient)
    console.log("Subject:", dataEntries.subject || dataEntries.Subject)

    // Store the raw email data in the queue for processing
    const emailData = {
      id: uuidv4(),
      rawData: JSON.stringify(dataEntries),
      processed: false,
      processingAttempts: 0,
      createdAt: new Date(),
    }

    // Save to the EmailQueue table
    await prisma.emailQueue.create({
      data: emailData,
    })

    console.log("Email queued for processing:", emailData.id)

    // Return a success response to Mailgun
    return NextResponse.json({
      success: true,
      message: "Email received and queued for processing",
      emailId: emailData.id,
    })
  } catch (error) {
    console.error("Error processing Mailgun Parse webhook:", error)
    return NextResponse.json(
      {
        error: "Failed to process email",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
