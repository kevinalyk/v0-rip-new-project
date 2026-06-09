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

  // Only return early for very high-confidence, unambiguous single-tag matches.
  // Never short-circuit on thank_you, event_invite, or personal_story — these commonly
  // co-occur with urgency/deadline and need the full AI pass to catch multi-tag combos.
  const singleTagSafe = ["match_offer", "survey_poll", "petition", "merchandise"]
  if (tags.length === 1 && singleTagSafe.includes(tags[0])) return tags

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
${preview.slice(0, 800)}

Rules:
- "urgency_deadline" = explicit hard deadline language is a MAJOR focus (e.g. "expires tonight", "hours left", "midnight deadline", "final notice", "FEC deadline"). A passing mention of a future deadline does NOT qualify alone.
- "match_offer" = a matching gift offer is explicitly mentioned (e.g. "your gift will be matched").
- "attack_opposition" = the PRIMARY and DOMINANT purpose of the email is attacking, criticizing, or going negative on an opponent or opposing party. Merely mentioning an opponent by name, referencing their win, or using them as motivation context does NOT qualify. The email must be fundamentally negative in tone and focus.
- "personal_story" = first-person narrative from the sender sharing a personal experience, journey, or emotional account. Rally updates and movement milestones count.
- "news_update" = primarily informational with no strong donation ask — sharing news, results, or updates.
- "thank_you" = a genuine expression of gratitude to supporters is a PRIMARY theme of the email, even if a soft donation ask appears.
- "event_invite" = inviting supporters to attend a rally, town hall, or event.
- "survey_poll" = asking supporters to answer questions or take a poll.
- "membership_offer" = promoting a membership, recurring giving program, or club.
- "merchandise" = promoting campaign merchandise.
- "petition" = asking supporters to sign a petition or pledge.
- An email can have multiple tags. A thank-you email that also mentions an FEC deadline should get BOTH "thank_you" AND "urgency_deadline".
- Never apply "attack_opposition" to an email whose overall tone is positive, grateful, or motivational — even if it mentions an opponent.
- Pick the most accurate tags. Maximum 3.

Return JSON with "types" (array of tag strings from the allowed list) and "confidence" (0–1).`,
    })

    const types = result.object.types.filter((t) => (allowedTypes as readonly string[]).includes(t))
    return types // empty array if nothing matched — unclassified is fine
  } catch (error) {
    console.error("[message-classifier] AI classification failed:", error)
    return []
  }
}
