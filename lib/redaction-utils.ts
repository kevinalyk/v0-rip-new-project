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

/**
 * Extract personalized first names from email HTML.
 * Detects names injected via common ESP personalization patterns:
 *   - Salutations: "Hey Wolfgang,", "Hi Wolfgang,", "Dear Wolfgang,"
 *   - Inline personalization: "chip in, Wolfgang?", "join us, Wolfgang!"
 *   - HubSpot/Mailchimp span pattern: <span ...>Wolfgang</span> following a salutation keyword
 *   - Preview text: "Wolfgang, The Supreme Court..."
 * Returns an array of unique capitalized names found.
 */
export function extractPersonalizedNames(html: string): string[] {
  if (!html) return []

  // Strip HTML tags to get plain text for pattern matching
  const plainText = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#[0-9]+;/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  const found = new Set<string>()
  const namePattern = /([A-Z][a-z]{1,19})/

  // Pattern 1: Salutation at start — "Wolfgang, The Supreme Court..."
  // Matches a capitalized word at the very start followed by a comma
  const previewMatch = plainText.match(/^([A-Z][a-z]{1,19}),\s/)
  if (previewMatch) found.add(previewMatch[1])

  // Pattern 2: "Hey/Hi/Dear/Hello [Name]," or "Hey/Hi/Dear [Name]!"
  const salutationRegex = /\b(?:Hey|Hi|Dear|Hello|Howdy)\s+([A-Z][a-z]{1,19})[,!]/g
  let m
  while ((m = salutationRegex.exec(plainText)) !== null) found.add(m[1])

  // Pattern 3: "chip in, [Name]?" / "join us, [Name]!" / "with us, [Name]"
  // Catches mid-sentence personalization like "Will you chip in, Wolfgang?"
  const midSentenceRegex = /\b(?:chip in|join us|with us|thank you|counting on you|need you),\s+([A-Z][a-z]{1,19})[?!.]/g
  while ((m = midSentenceRegex.exec(plainText)) !== null) found.add(m[1])

  // Pattern 4: HubSpot/Mailchimp span with text-transform:capitalize
  // <span style="text-transform: capitalize;">Wolfgang</span>
  const spanRegex = /<span[^>]*text-transform\s*:\s*capitalize[^>]*>([A-Za-z]{2,20})<\/span>/gi
  while ((m = spanRegex.exec(html)) !== null) {
    const name = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()
    if (/^[A-Z][a-z]{1,19}$/.test(name)) found.add(name)
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
