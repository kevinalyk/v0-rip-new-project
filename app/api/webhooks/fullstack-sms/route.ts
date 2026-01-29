import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { v4 as uuidv4 } from "uuid"
import crypto from "crypto"
import { findEntityForPhone } from "@/lib/ci-entity-utils"
import { extractSmsCtaLinks } from "@/lib/sms-link-extractor"

// Verify FullStack webhook signature (if they provide one)
// You'll need to ask FullStack if they send a signature header and what the signing method is
function verifyFullStackWebhook(body: string, signature: string | null): boolean {
  // If no signature is provided by FullStack, we'll skip verification for now
  // TODO: Ask FullStack about their webhook signature method and update this
  if (!signature) {
    console.log("[FullStack SMS] No signature provided, skipping verification")
    return true
  }

  const signingKey = process.env.FULLSTACK_WEBHOOK_SIGNING_KEY

  if (!signingKey) {
    console.error("[FullStack SMS] FULLSTACK_WEBHOOK_SIGNING_KEY environment variable is not set")
    return false
  }

  // Example HMAC verification (adjust based on FullStack's actual method)
  const computedSignature = crypto.createHmac("sha256", signingKey).update(body).digest("hex")

  return computedSignature === signature
}

/**
 * Extract the actual sender from SMS message
 * Detects pattern: [number] | [message content]
 * If found, extracts the number as sender and content after pipe as message
 */
function extractActualSender(senderNumber: string, messageBody: string): { sender: string; cleanedMessage: string } {
  // Pattern: [short code or long code] | [message]
  if (messageBody.includes("|")) {
    const pipeIndex = messageBody.indexOf("|")
    const extractedSender = messageBody.substring(0, pipeIndex).trim()
    const cleanedMessage = messageBody.substring(pipeIndex + 1).trim()

    // Validate sender format:
    // - Short code: 5-6 digits (e.g., "88022", "80810", "43021")
    // - Long code: +1 followed by 10 digits (e.g., "+17712445944")
    const isShortCode = /^\d{5,6}$/.test(extractedSender)
    const isLongCodeWithPlus = /^\+1\d{10}$/.test(extractedSender)

    if (isShortCode) {
      console.log(`[FullStack SMS] Pattern detected: ${senderNumber} → Short code: ${extractedSender}`)
      return { sender: extractedSender, cleanedMessage }
    } else if (isLongCodeWithPlus) {
      // Remove the + prefix from long codes before storing
      const finalSender = extractedSender.substring(1)
      console.log(`[FullStack SMS] Pattern detected: ${senderNumber} → Long code: ${finalSender}`)
      return { sender: finalSender, cleanedMessage }
    }
  }

  // No pattern found - use the incoming phone number as sender
  const normalized = senderNumber.trim().replace(/^\+?1?/, "")
  return { sender: normalized, cleanedMessage: messageBody }
}

export async function POST(request: Request) {
  try {
    console.log("[FullStack SMS] Received SMS webhook from FullStack")

    // Get the raw body for signature verification
    const body = await request.text()

    // Check for signature header (adjust header name based on FullStack's documentation)
    const signature = request.headers.get("x-fullstack-signature") || request.headers.get("x-webhook-signature")

    // Verify the webhook signature
    if (!verifyFullStackWebhook(body, signature)) {
      console.error("[FullStack SMS] Invalid webhook signature")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    // Parse the JSON payload
    const data = JSON.parse(body)

    const { sender: actualSender, cleanedMessage } = extractActualSender(data.phone_number, data.message)

    // Log the received data for debugging
    console.log("[FullStack SMS] Webhook data received:")
    console.log("Gateway/From:", data.phone_number)
    console.log("Actual Sender:", actualSender)
    console.log("To:", data.to)
    console.log("Original Message:", data.message)
    console.log("Cleaned Message:", cleanedMessage)
    console.log("Campaign ID:", data.campaign_id)
    console.log("Company ID:", data.company_id)

    // Look for existing SMS with same phone number and message within the last 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
    const existingSms = await prisma.smsQueue.findFirst({
      where: {
        phoneNumber: actualSender,
        message: cleanedMessage,
        createdAt: {
          gte: fiveMinutesAgo,
        },
      },
    })

    if (existingSms) {
      console.log("[FullStack SMS] Duplicate SMS detected, ignoring:", existingSms.id)
      return NextResponse.json({
        success: true,
        message: "Duplicate SMS ignored",
        smsId: existingSms.id,
      })
    }

    let ctaLinks: Array<{ url: string; finalUrl?: string; type: string }> = []
    try {
      ctaLinks = await extractSmsCtaLinks(cleanedMessage)
      console.log(`[FullStack SMS] Extracted ${ctaLinks.length} CTA link(s) from SMS`)
    } catch (error) {
      console.error("[FullStack SMS] Error extracting CTA links:", error)
    }

    const entityAssignment = actualSender ? await findEntityForPhone(actualSender, ctaLinks) : null

    if (entityAssignment) {
      console.log(
        "[FullStack SMS] Auto-assigned to entity:",
        entityAssignment.entityId,
        "via",
        entityAssignment.assignmentMethod,
      )
    }

    // Store the raw SMS data in the queue for processing
    const smsData = {
      id: uuidv4(),
      rawData: body,
      processed: true, // Set to true so SMS shows up in campaigns immediately
      processingAttempts: 0,
      phoneNumber: actualSender, // Store the actual sender, not the gateway
      toNumber: data.to,
      message: cleanedMessage, // Store cleaned message without the sender prefix
      campaignId: data.campaign_id,
      companyId: data.company_id,
      entityId: entityAssignment?.entityId || null,
      assignmentMethod: entityAssignment?.assignmentMethod || null,
      assignedAt: entityAssignment ? new Date() : null,
      ctaLinks: JSON.stringify(ctaLinks), // Store extracted links as JSON
      createdAt: new Date(),
    }

    // Save to the SmsQueue table
    await prisma.smsQueue.create({
      data: smsData,
    })

    console.log("[FullStack SMS] SMS queued for processing:", smsData.id)

    // Return a success response to FullStack
    return NextResponse.json({
      success: true,
      message: "SMS received and queued for processing",
      smsId: smsData.id,
    })
  } catch (error) {
    console.error("[FullStack SMS] Error processing SMS webhook:", error)
    return NextResponse.json(
      {
        error: "Failed to process SMS",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
