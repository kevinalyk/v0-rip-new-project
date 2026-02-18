import prisma from "@/lib/prisma"
import { v4 as uuidv4 } from "uuid"
import { canClientProcessEmails } from "@/lib/subscription-utils"
import { sanitizeEmailLinks } from "@/lib/competitive-insights-utils"

// Interface for the email queue item
interface EmailQueueItem {
  id: string
  rawData: string
  processed: boolean
  processingAttempts: number
  error?: string | null
  createdAt: Date
  processedAt?: Date | null
}

// Process a single email from the queue
export async function processEmail(queueItem: EmailQueueItem) {
  try {
    console.log(`Processing email ${queueItem.id}`)

    // Parse the raw data
    const emailData = JSON.parse(queueItem.rawData)

    // Extract key information
    const {
      sender = "",
      from = "",
      subject = "",
      recipient = "",
      to = "",
      "body-html": bodyHtml = "",
      "body-plain": bodyPlain = "",
      "message-headers": messageHeaders = "[]",
      timestamp = Date.now() / 1000,
    } = emailData

    // Parse the sender email
    const senderEmail = extractEmailAddress(from || sender)
    const senderName = extractSenderName(from || sender)

    // Parse the recipient (seed email that forwarded to us)
    const seedEmail = extractEmailAddress(recipient || to)

    const recipientEmail = recipient || to
    const clientSlug = extractClientSlugFromRecipient(recipientEmail)
    let clientId: string | null = null

    if (clientSlug) {
      // Find the client by slug
      const client = await prisma.client.findUnique({
        where: { slug: clientSlug },
        select: { id: true },
      })

      if (client) {
        clientId = client.id
        console.log(`Email sent to personal email for client: ${clientId}`)
      }
    }

    const seedEmailRecord = await prisma.seedEmail.findUnique({
      where: { email: seedEmail },
      select: { assignedToClient: true },
    })

    if (seedEmailRecord?.assignedToClient) {
      const client = await prisma.client.findUnique({
        where: { name: seedEmailRecord.assignedToClient },
        select: {
          id: true,
          subscriptionStatus: true,
          subscriptionPlan: true,
          hasCompetitiveInsights: true,
          emailVolumeUsed: true,
          emailVolumeLimit: true,
        },
      })

      if (client && !canClientProcessEmails(client)) {
        console.log(`[v0] Skipping email processing for cancelled client: ${client.id}`)
        return {
          id: queueItem.id,
          success: false,
          error: "Client subscription is not active",
        }
      }
    }

    // Determine email provider
    const emailProvider = determineEmailProvider(seedEmail)

    // Parse message headers
    const headers = parseHeaders(messageHeaders)

    // Determine placement status (inbox, spam, missing)
    const placementStatus = determinePlacementStatus(headers, bodyHtml, bodyPlain)

    // Find or create campaign based on subject
    const normalizedSubject = normalizeSubject(subject)

    const campaign = await findOrCreateCampaign(normalizedSubject, senderName, senderEmail)

    // Store email content if this is the first email for this campaign
    const existingContent = await prisma.emailContent.findUnique({
      where: { campaignId: campaign.id },
    })

    if (!existingContent) {
      const sanitizedHtml = sanitizeEmailLinks(bodyHtml)

      await prisma.emailContent.create({
        data: {
          id: uuidv4(),
          campaignId: campaign.id,
          subject: normalizedSubject,
          sender: senderName,
          senderEmail: senderEmail,
          htmlContent: sanitizedHtml,
          textContent: bodyPlain,
          receivedAt: new Date(timestamp * 1000),
        },
      })
    }

    // Create or update result for this seed email
    const result = await prisma.result.upsert({
      where: {
        id: `${campaign.id}_${seedEmail.replace(/[^a-zA-Z0-9]/g, "_")}`, // Create a deterministic ID
      },
      update: {
        delivered: true,
        inboxed: placementStatus === "inbox",
        placementStatus,
        emailProvider,
        emailHeaders: JSON.stringify(headers),
        forwardedAt: new Date(),
      },
      create: {
        id: uuidv4(),
        campaignId: campaign.id,
        seedEmail,
        delivered: true,
        inboxed: placementStatus === "inbox",
        placementStatus,
        emailProvider,
        emailHeaders: JSON.stringify(headers),
        forwardedAt: new Date(),
      },
    })

    // Update campaign delivery rate
    await updateCampaignDeliveryRate(campaign.id)

    return {
      id: queueItem.id,
      success: true,
      campaignId: campaign.id,
      resultId: result.id,
      placementStatus,
    }
  } catch (error) {
    console.error(`Error processing email ${queueItem.id}:`, error)
    throw error
  }
}

// Helper functions

// Extract email address from a string like "Name <email@example.com>"
function extractEmailAddress(str: string): string {
  const matches = str.match(/<([^>]+)>/) || str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
  return matches ? matches[1] : str
}

// Extract sender name from a string like "Name <email@example.com>"
function extractSenderName(str: string): string {
  const matches = str.match(/^([^<]+)/)
  return matches ? matches[1].trim() : str
}

// Determine email provider based on domain
function determineEmailProvider(email: string): string {
  const domain = email.split("@")[1]?.toLowerCase() || ""

  if (domain.includes("gmail")) return "gmail"
  if (domain.includes("yahoo")) return "yahoo"
  if (domain.includes("outlook") || domain.includes("hotmail") || domain.includes("live")) return "outlook"
  if (domain.includes("aol")) return "aol"
  if (domain.includes("icloud") || domain.includes("me.com") || domain.includes("mac.com")) return "icloud"

  return "other"
}

// Parse message headers
function parseHeaders(headersStr: string): Record<string, string> {
  try {
    const headers = JSON.parse(headersStr)
    return headers.reduce((acc: Record<string, string>, [key, value]: [string, string]) => {
      acc[key.toLowerCase()] = value
      return acc
    }, {})
  } catch (e) {
    console.error("Error parsing headers:", e)
    return {}
  }
}

// Determine placement status (inbox, spam, missing)
function determinePlacementStatus(headers: Record<string, string>, bodyHtml: string, bodyPlain: string): string {
  // Look for spam indicators in headers
  const spamHeaders = ["x-spam-flag: yes", "x-spam-status: yes", "x-spam-level", "x-spam-score", "x-spam-report"]

  for (const header of Object.keys(headers)) {
    const headerValue = headers[header].toLowerCase()
    if (spamHeaders.some((spamHeader) => header.toLowerCase().includes(spamHeader.toLowerCase()))) {
      return "spam"
    }

    // Check for Gmail's spam notification
    if (header.toLowerCase() === "x-gmail-labels" && headerValue.includes("spam")) {
      return "spam"
    }
  }

  // Check for common spam folder indicators in the email body
  const spamIndicators = ["moved to your spam folder", "marked as spam", "junk folder", "spam folder"]

  const bodyText = (bodyPlain || bodyHtml).toLowerCase()
  if (spamIndicators.some((indicator) => bodyText.includes(indicator))) {
    return "spam"
  }

  // Default to inbox if no spam indicators found
  return "inbox"
}

// Normalize subject line by removing prefixes like "Fwd:", "Re:", etc.
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(re|fwd|fw|forward):\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
}

// Find or create a campaign based on subject
async function findOrCreateCampaign(subject: string, sender: string, senderEmail: string) {
  // Look for existing campaign with the same subject
  const existingCampaign = await prisma.campaign.findFirst({
    where: { subject: { equals: subject, mode: "insensitive" } },
  })

  if (existingCampaign) {
    return existingCampaign
  }

  // Create new campaign
  return await prisma.campaign.create({
    data: {
      id: uuidv4(),
      subject,
      sender,
      fromEmail: senderEmail,
      deliveryRate: 0,
      sentDate: new Date(), // Use current date as an estimate
    },
  })
}

// Update campaign delivery rate
async function updateCampaignDeliveryRate(campaignId: string) {
  // Get all results for this campaign
  const results = await prisma.result.findMany({
    where: { campaignId },
  })

  // Calculate delivery rate
  const totalResults = results.length
  const inboxedResults = results.filter((r) => r.inboxed).length
  const deliveryRate = totalResults > 0 ? inboxedResults / totalResults : 0

  // Update campaign
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { deliveryRate },
  })
}

function extractClientSlugFromRecipient(recipient: string): string | null {
  // Check if recipient is a @realdailyreview.com email
  const match = recipient.match(/^([a-zA-Z0-9\-_]+)@realdailyreview\.com$/i)
  return match ? match[1] : null
}
