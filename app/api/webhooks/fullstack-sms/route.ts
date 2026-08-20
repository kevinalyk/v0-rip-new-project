import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { v4 as uuidv4 } from "uuid"
import crypto from "crypto"
import { findEntityForPhone } from "@/lib/ci-entity-utils"
import { extractSmsCtaLinks } from "@/lib/sms-link-extractor"
import { getRedactedNames, applyRedaction } from "@/lib/redaction-utils"
import { notifyFollowersOfNewMessage } from "@/lib/slack-alerts"
import { nanoid } from "nanoid"

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

    // In FullStack's webhook format:
    // - phone_number = the RECEIVING number (your seed phone)
    // - to = the forwarding gateway number
    // So we need to store phone_number as toNumber
    const receivingNumber = data.phone_number

    // Log the received data for debugging
    console.log("[FullStack SMS] Webhook data received:")
    console.log("Receiving Number (your seed):", receivingNumber)
    console.log("Actual Sender:", actualSender)
    console.log("Gateway/Forwarding To:", data.to)
    console.log("Original Message:", data.message)
    console.log("Cleaned Message:", cleanedMessage)
    console.log("Campaign ID:", data.campaign_id)
    console.log("Company ID:", data.company_id)

    // Compute a deterministic dedup hash from sender + normalized message content.
    // Normalize: strip trailing " x" test suffix, collapse whitespace, lowercase, first 160 chars.
    // This hash is stored with @unique so concurrent webhooks can't both insert — the DB rejects
    // the second one atomically, avoiding race conditions that read-then-write can never solve.
    const normalizeForDedup = (msg: string) =>
      msg.replace(/\s+x\s*$/i, "").replace(/\s+/g, " ").trim().toLowerCase().substring(0, 160)

    const dedupHash = crypto
      .createHash("sha256")
      .update(`${actualSender}::${normalizeForDedup(cleanedMessage)}`)
      .digest("hex")

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

    // Check if the receiving number is assigned to a specific client (personal SMS)
    // Normalize the receiving number for lookup (remove +1 prefix if present)
    const normalizedReceivingNumber = receivingNumber.replace(/^\+?1?/, "")
    const personalPhoneAssignment = await prisma.personalPhoneNumber.findFirst({
      where: {
        OR: [
          { phoneNumber: normalizedReceivingNumber },
          { phoneNumber: receivingNumber },
          { phoneNumber: `+1${normalizedReceivingNumber}` },
          { phoneNumber: `1${normalizedReceivingNumber}` },
        ],
      },
      select: { clientId: true },
    })

    if (personalPhoneAssignment) {
      console.log("[FullStack SMS] Personal phone assignment found for client:", personalPhoneAssignment.clientId)
    }

    // Apply name redaction to protect seed identities
    const redactedNames = await getRedactedNames()
    const nameRedactedMessage = (applyRedaction(cleanedMessage, redactedNames) as string) || cleanedMessage

    // Omit URLs from the message body — links are preserved in ctaLinks for the CTA section
    // Matches both https://example.com/path and bare domains like example.com/path
    const urlRegex = /https?:\/\/[^\s]+|(?<![a-zA-Z0-9@])(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/g
    const redactedMessage = nameRedactedMessage.replace(urlRegex, "[Omitted Link]")

    // Save to the SmsQueue table.
    // NOTE: We use create() + catch P2002 rather than upsert() here. Prisma's upsert with an
    // empty update payload ({}) cannot compile to a single atomic `INSERT ... ON CONFLICT DO
    // UPDATE` (there's nothing to update), so it falls back to a non-atomic "check, then write"
    // path. Under real broadcast-SMS volume, many webhook calls arrive within milliseconds with
    // the exact same sender+message (same dedupHash) - they all pass the existence check, then
    // race to create(), and every loser throws an uncaught P2002 straight to the outer catch
    // block (returning a 500 before entity assignment / Slack alerts ever run). Catching P2002
    // here and treating it as "already inserted by a concurrent request" is the actual
    // race-safe pattern - the DB's unique constraint still does the real dedup work, we just
    // handle its rejection gracefully instead of crashing on it.
    const smsId = uuidv4()
    let result: { id: string }
    let isDuplicate = false
    try {
      result = await prisma.smsQueue.create({
        data: {
          id: smsId,
          rawData: body,
          processed: true,
          processingAttempts: 0,
          phoneNumber: actualSender,
          toNumber: receivingNumber, // The number that received the SMS (your seed phone)
          message: redactedMessage,
          campaignId: data.campaign_id,
          companyId: data.company_id,
          entityId: entityAssignment?.entityId || null,
          assignmentMethod: entityAssignment?.assignmentMethod || null,
          assignedAt: entityAssignment ? new Date() : null,
          ctaLinks: JSON.stringify(ctaLinks),
          dedupHash,
          // Personal SMS assignment
          clientId: personalPhoneAssignment?.clientId || null,
          source: personalPhoneAssignment ? "personal" : "seed",
          createdAt: new Date(),
        },
      })
    } catch (createError: any) {
      // P2002 = unique constraint violation. Another concurrent request won the race for this
      // exact dedupHash - fetch the row it created and treat this request as a duplicate.
      if (createError?.code === "P2002") {
        const existing = await prisma.smsQueue.findUnique({ where: { dedupHash }, select: { id: true } })
        if (existing) {
          result = existing
          isDuplicate = true
        } else {
          // Extremely unlikely (row deleted between the constraint failure and this lookup) -
          // surface the original error rather than silently dropping a real SMS.
          throw createError
        }
      } else {
        throw createError
      }
    }

    if (isDuplicate) {
      console.log("[FullStack SMS] Duplicate SMS detected via dedupHash, ignored:", result.id)
      return NextResponse.json({ success: true, message: "Duplicate SMS ignored", smsId: result.id })
    }

    console.log("[FullStack SMS] SMS queued for processing:", result.id)

    // Fire a real-time Slack alert to any client following this entity.
    // Never blocks the webhook response - internally logs and swallows errors.
    if (entityAssignment?.entityId) {
      const entity = await prisma.ciEntity.findUnique({
        where: { id: entityAssignment.entityId },
        select: { name: true },
      })
      if (entity) {
        const shareToken = nanoid(16)
        await prisma.smsQueue.update({
          where: { id: result.id },
          data: { shareToken, shareTokenCreatedAt: new Date(), shareTokenSource: "Slack Alert" },
        })
        await notifyFollowersOfNewMessage({
          kind: "sms",
          entityId: entityAssignment.entityId,
          entityName: entity.name,
          phoneNumber: actualSender,
          message: redactedMessage,
          shareToken,
        })
      }
    }

    // Return a success response to FullStack
    return NextResponse.json({
      success: true,
      message: "SMS received and queued for processing",
      smsId: result.id,
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
