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
 * Apply redaction to a string, replacing all occurrences of redacted names with [Omitted]
 * Case-sensitive, whole-word matching
 */
export function applyRedaction(text: string | null | undefined, names: string[]): string | null | undefined {
  if (!text || names.length === 0) return text

  let result = text

  for (const name of names) {
    // Escape special regex characters in the name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    // Whole-word, case-sensitive replacement
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



  // Filter out common false positives (words that look like names but aren't)
  const stopWords = new Set([
    "The", "This", "That", "They", "Their", "There", "These", "Those",
    "Will", "With", "When", "What", "Which", "Where", "While",
    "Your", "You", "Our", "For", "But", "And", "Not", "Now",
    "New", "Big", "Can", "Has", "Was", "Are", "All", "Any",
    "We", "He", "She", "It", "In", "On", "Of", "To", "At",
    "By", "As", "An", "If", "Or", "So", "Up", "Do",
    "Supreme", "Court", "Democrats", "Republicans", "Congress",
    "America", "American", "Americans", "United", "States",
    "Stop", "Help", "Join", "Give", "Read", "Click", "Here",
    "Today", "Just", "More", "Less", "From", "Into", "Over",
  ])

  return Array.from(found).filter((name) => !stopWords.has(name))
}

/**
 * Find a unique subject for a given senderEmail after redaction.
 * If the redacted subject already exists for that sender, append trailing spaces
 * one at a time (up to 5 attempts) until a unique value is found.
 * This handles the case where two emails from the same sender become identical
 * after name redaction (e.g. "Hey Sal," and "Hey Jason," both become "Hey [Omitted],").
 */
export async function findUniqueRedactedSubject(
  senderEmail: string,
  redactedSubject: string,
  excludeId?: string,
  prismaClient?: typeof import("@/lib/prisma").default,
): Promise<string> {
  const client = prismaClient || (await import("@/lib/prisma")).default
  let candidate = redactedSubject

  for (let attempt = 0; attempt <= 5; attempt++) {
    const where: Record<string, unknown> = { senderEmail, subject: candidate }
    if (excludeId) where.id = { not: excludeId }

    const collision = await client.competitiveInsightCampaign.findFirst({ where: where as any })
    if (!collision) return candidate

    // Append one more trailing space and try again
    candidate = redactedSubject + " ".repeat(attempt + 1)
  }

  // Fallback: return with 5 spaces (extremely unlikely to still collide)
  return candidate
}

/**
 * Auto-detect and persist any personalized names found in email HTML.
 * Adds new names to the RedactedName table and clears the cache.
 * Returns the list of newly added names.
 */
export async function autoDetectAndSaveNames(
  html: string,
  prismaClient: typeof import("@/lib/prisma").default,
): Promise<string[]> {
  const detected = extractPersonalizedNames(html)
  if (detected.length === 0) return []

  const added: string[] = []

  for (const name of detected) {
    try {
      const existing = await prismaClient.redactedName.findFirst({ where: { name } })
      if (!existing) {
        await prismaClient.redactedName.create({ data: { name } })
        added.push(name)
      }
    } catch {
      // Ignore duplicate/constraint errors
    }
  }

  if (added.length > 0) clearRedactionCache()

  return added
}
