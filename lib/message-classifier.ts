import { generateObject } from "ai"
import { z } from "zod"

/**
 * Default message type tags.
 * Exported so future per-client custom tag lists can extend or replace this set.
 */
export const DEFAULT_MESSAGE_TYPES = [
  "urgency_deadline",
  "match_offer",
  "survey_poll",
  "petition",
  "event_invite",
  "news_update",
  "personal_story",
  "attack_opposition",
  "thank_you",
  "membership_offer",
  "merchandise",
] as const

export type MessageType = (typeof DEFAULT_MESSAGE_TYPES)[number]

// Human-readable labels for display
export const MESSAGE_TYPE_LABELS: Record<string, string> = {
  urgency_deadline: "Urgency / Deadline",
  match_offer: "Match Offer",
  survey_poll: "Survey / Poll",
  petition: "Petition",
  event_invite: "Event Invite",
  news_update: "News Update",
  personal_story: "Personal Story",
  attack_opposition: "Attack / Opposition",
  thank_you: "Thank You",
  membership_offer: "Membership Offer",
  merchandise: "Merchandise",
}

/**
 * Fast regex pre-filter — if we can determine type(s) from subject + preview alone,
 * skip the AI call entirely to save cost on obvious cases.
 */
function quickClassify(subject: string, preview: string): string[] | null {
  const text = `${subject} ${preview}`.toLowerCase()
  const tags: string[] = []

  if (/\b(match(ed|ing)?|matched|triple|double)\b.*\b(gift|donat|dollar)/i.test(text)) tags.push("match_offer")
  if (/\b(survey|poll|questionnaire|tell us|take our)\b/i.test(text)) tags.push("survey_poll")
  if (/\bpetition\b/i.test(text)) tags.push("petition")
  if (/\b(event|rally|join us|town hall|hearing)\b/i.test(text)) tags.push("event_invite")
  if (/\bthank\s*(you|s)\b/i.test(text)) tags.push("thank_you")
  if (/\b(merch|t-shirt|hat|mug|store|shop)\b/i.test(text)) tags.push("merchandise")

  // Only return early for very high-confidence single-tag matches
  if (tags.length === 1 && tags[0] !== "thank_you") return tags

  return null // Fall through to AI
}

const classificationSchema = z.object({
  types: z
    .array(z.string())
    .describe("1–3 message type tags from the allowed list that best describe this email"),
  confidence: z.number().min(0).max(1),
})

/**
 * Classify a political email into 1–3 message type tags.
 *
 * @param subject  The raw (un-redacted) subject line
 * @param preview  First ~500 chars of plain-text email body
 * @param allowedTypes  Defaults to DEFAULT_MESSAGE_TYPES; pass custom list for per-client overrides
 */
export async function classifyMessageTypes(
  subject: string,
  preview: string,
  allowedTypes: readonly string[] = DEFAULT_MESSAGE_TYPES,
): Promise<string[]> {
  // 1. Try quick regex path first
  const quick = quickClassify(subject, preview)
  if (quick) return quick

  // 2. AI classification
  try {
    const result = await generateObject({
      model: "google/gemini-2.0-flash",
      mode: "json",
      schema: classificationSchema,
      prompt: `You are classifying a political fundraising email into message type tags.

ALLOWED TAGS (pick 1–3 that best apply):
${allowedTypes.map((t) => `- ${t}`).join("\n")}

SUBJECT: ${subject}

EMAIL PREVIEW:
${preview.slice(0, 600)}

Rules:
- "urgency_deadline" = hard deadline language (expires, hours left, midnight, final notice).
- "match_offer" = matching gift mentioned.
- "attack_opposition" = primary focus is criticizing opponent or opposing party.
- "personal_story" = first-person narrative from the sender about personal experience.
- "news_update" = primarily informational, no strong ask.
- Pick the most specific tags. Maximum 3.

Return JSON with "types" (array of tag strings from the allowed list) and "confidence" (0–1).`,
    })

    const types = result.object.types.filter((t) => (allowedTypes as readonly string[]).includes(t))
    return types // empty array if nothing matched — unclassified is fine
  } catch (error) {
    console.error("[message-classifier] AI classification failed:", error)
    return []
  }
}
