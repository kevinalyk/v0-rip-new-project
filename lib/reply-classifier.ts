import { generateObject } from "ai"
import { z } from "zod"

/**
 * Reply category tags — a smaller, single-tag set than lib/message-classifier.ts (which
 * allows 1-3 CI tags). This classifier picks exactly ONE category, used only to select which
 * AutoReplyTemplate pool to draw from for the auto-reply-verified-domains cron.
 */
export const REPLY_CATEGORIES = [
  "thank_you",
  "event_invite",
  "news_update",
  "fundraising_ask",
  "general",
] as const

export type ReplyCategory = (typeof REPLY_CATEGORIES)[number]

/**
 * Fast regex pre-filter — if we can determine the category from subject + preview alone,
 * skip the AI call entirely to save cost on obvious cases. Only returns for high-confidence,
 * unambiguous matches; everything else falls through to the AI pass.
 */
function quickClassify(subject: string, preview: string): ReplyCategory | null {
  const text = `${subject} ${preview}`.toLowerCase()

  if (/\b(thank you|thanks (so much|a lot)|we('re| are) grateful|much appreciated)\b/i.test(subject)) return "thank_you"
  if (/\b(rsvp|join us (at|for)|save the date|town hall|watch party|rally)\b/i.test(text)) return "event_invite"
  if (/\b(donate|contribute|chip in|matching gift|fec deadline|split.?\s?the.?\s?pot)\b/i.test(text)) return "fundraising_ask"

  return null // Fall through to AI
}

const classificationSchema = z.object({
  category: z.enum(REPLY_CATEGORIES).describe("The single best-fit reply category for this email"),
  reasoning: z.string().describe("1 sentence explanation of why this category was chosen"),
})

export interface ReplyClassificationResult {
  category: ReplyCategory
  reasoning: string
}

/**
 * Classify an inbound email into exactly one reply category, used to pick which
 * AutoReplyTemplate pool to draw a short auto-reply from.
 *
 * @param subject  The raw subject line
 * @param preview  First ~300 chars of plain-text email body (DomainHealthEmailSample.emailPreview)
 */
export async function classifyForReply(subject: string, preview: string): Promise<ReplyClassificationResult> {
  // 1. Try quick regex path first
  const quick = quickClassify(subject, preview)
  if (quick) return { category: quick, reasoning: "Matched via regex pattern (no AI call needed)." }

  // 2. AI classification
  try {
    const result = await generateObject({
      model: "openai/gpt-4o-mini",
      schema: classificationSchema,
      prompt: `You are picking ONE reply category for a short auto-reply to an inbound email.

ALLOWED CATEGORIES (pick exactly one):
- "thank_you" = the email's primary theme is thanking the recipient, celebrating a milestone, or expressing gratitude.
- "event_invite" = the email invites the recipient to an event, rally, town hall, watch party, or asks for an RSVP.
- "news_update" = the email is sharing news, updates, poll results, endorsements, or milestones as its main content.
- "fundraising_ask" = the primary ask is a donation, contribution, or matching-gift appeal.
- "general" = none of the above clearly apply, or the email is a mix with no dominant theme.

SUBJECT: ${subject}

EMAIL PREVIEW:
${preview.slice(0, 500)}

Return JSON with "category" (exactly one of the allowed values) and "reasoning" (1 sentence).`,
    })

    return { category: result.object.category, reasoning: result.object.reasoning ?? "" }
  } catch (error) {
    console.error("[reply-classifier] AI classification failed:", error)
    return { category: "general", reasoning: "AI classification failed — defaulted to general." }
  }
}
