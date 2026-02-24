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
 * Apply context-aware redaction to a string, replacing names ONLY when they appear
 * in personalization/greeting patterns (not in general political content).
 * 
 * This prevents accidentally redacting politician names that match seed names.
 * 
 * Patterns matched (case-sensitive for the name, case-insensitive for the greeting):
 * - Greetings: "Dear Isaac,", "Hi Isaac,", "Hey Isaac!", "Hello Isaac,"
 * - Standalone salutations: "Isaac," at start of line or after line break
 * - Direct address: "Isaac --", "Isaac -", "Isaac:"
 * - Sentence-start direct address: "Isaac, I'm not some..."
 * - Exclamatory: "WOAH! Red,", patterns with name followed by comma
 * - HTML greetings: same patterns but within HTML tags
 */
export function applyRedaction(text: string | null | undefined, names: string[]): string | null | undefined {
  if (!text || names.length === 0) return text

  let result = text

  for (const name of names) {
    // Escape special regex characters in the name
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

    // Pattern 1: Greeting prefixes (Dear, Hi, Hey, Hello, Greetings) followed by the name
    // Matches: "Dear Isaac,", "Hi Red!", "Hey Sal,", "Hello Wolfgang"
    const greetingRegex = new RegExp(
      `((?:Dear|Hi|Hey|Hello|Greetings|Welcome|Thanks|Thank you|Hiya)\\s+)${escaped}\\b`,
      "gi"
    )
    result = result.replace(greetingRegex, "$1[Omitted]")

    // Pattern 2: Name at the very start of the text or after a newline/break, followed by comma or dash
    // Matches: "Isaac," at start, or after <br>, \n, <p>, <td>, etc.
    const lineStartRegex = new RegExp(
      `(^|\\n|<br\\s*\\/?>|<p[^>]*>|<td[^>]*>|<div[^>]*>)\\s*${escaped}\\s*([,!;:\\-—])`,
      "gm"
    )
    result = result.replace(lineStartRegex, `$1[Omitted]$2`)

    // Pattern 3: After punctuation + space, name followed by comma (mid-sentence direct address)
    // Matches: "WOAH! Red,", "Listen up, Isaac,", "OK Red,"
    const midSentenceRegex = new RegExp(
      `([!?.;]\\s+)${escaped}\\s*([,!;:\\-—])`,
      "g"
    )
    result = result.replace(midSentenceRegex, "$1[Omitted]$2")

    // Pattern 4: Name followed by dash/emdash (common in email personalization)
    // Matches: "Isaac --", "Red -", "Sal —"
    const dashRegex = new RegExp(
      `\\b${escaped}\\s+[-—]{1,2}\\s`,
      "g"
    )
    result = result.replace(dashRegex, "[Omitted] -- ")
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
