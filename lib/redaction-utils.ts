import prisma from "@/lib/prisma"

// Cache for redacted names to avoid hitting DB on every request
let cachedNames: string[] | null = null
let cacheTimestamp = 0
const CACHE_TTL = 60 * 1000 // 1 minute cache

/**
 * Get all redacted names, with caching
 */
export async function getRedactedNames(): Promise<string[]> {
  const now = Date.now()

  if (cachedNames && now - cacheTimestamp < CACHE_TTL) {
    return cachedNames
  }

  try {
    const names = await prisma.redactedName.findMany({
      select: { name: true },
    })
    cachedNames = names.map((n) => n.name)
    cacheTimestamp = now
    return cachedNames
  } catch (error) {
    console.error("[Redaction] Error fetching redacted names:", error)
    return cachedNames || []
  }
}

/**
 * Clear the redacted names cache (call after adding/removing names)
 */
export function clearRedactionCache() {
  cachedNames = null
  cacheTimestamp = 0
}

/**
 * Apply redaction to a string, replacing all redacted names with [Omitted]
 * Case-sensitive, whole-word matching
 */
export function applyRedaction(text: string | null | undefined, names: string[]): string | null | undefined {
  if (!text || names.length === 0) return text

  let result = text

  for (const name of names) {
    // Escape special regex characters in the name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Use word boundary matching for whole-word, case-sensitive
    const regex = new RegExp(`\\b${escaped}\\b`, "g")
    result = result.replace(regex, "[Omitted]")
  }

  return result
}

/**
 * Apply redaction to email campaign fields
 * Redacts: subject, emailContent, emailPreview, senderName
 */
export function redactEmailCampaign(
  campaign: {
    subject?: string | null
    emailContent?: string | null
    emailPreview?: string | null
    senderName?: string | null
  },
  names: string[],
): {
  subject?: string | null
  emailContent?: string | null
  emailPreview?: string | null
  senderName?: string | null
} {
  return {
    subject: applyRedaction(campaign.subject, names),
    emailContent: applyRedaction(campaign.emailContent, names),
    emailPreview: applyRedaction(campaign.emailPreview, names),
    senderName: applyRedaction(campaign.senderName, names),
  }
}

/**
 * Apply redaction to SMS message
 * Redacts: message
 */
export function redactSmsMessage(
  sms: { message?: string | null },
  names: string[],
): { message?: string | null } {
  return {
    message: applyRedaction(sms.message, names),
  }
}
