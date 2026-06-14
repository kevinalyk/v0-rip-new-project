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
  const sub = subject.toLowerCase()
  const text = `${sub} ${preview.toLowerCase()}`
  const tags: string[] = []

  // urgency_deadline: deadline/time language anywhere
  if (/\b(midnight|deadline|hours? left|minutes? left|expires?|expiring|running out|last chance|final (hours?|day|chance)|end.of.month|end.of.quarter|fec deadline|before it.s too late|tonight|by \d+[ap]m|cutoff|time is running|clock is ticking|don.t (wait|miss)|act now|act (fast|today)|respond (now|today|immediately))\b/i.test(text)) {
    tags.push("urgency_deadline")
  }

  // match_offer: matching gift language
  if (/\b(match(ed|ing)?|triple match|double match|2x|3x)\b.{0,50}\b(gift|donat|dollar|\$)/i.test(text) ||
      /\b(your (gift|donation) will be match)\b/i.test(text)) {
    tags.push("match_offer")
  }

  // survey_poll: explicit survey/poll ask
  if (/\b(take (our|this|the) (survey|poll)|complete (our|this|the) (survey|poll)|answer (our|this|the) (survey|poll)|official survey|official poll|submit your (survey|poll))\b/i.test(text) ||
      /\b(survey|poll)\b/i.test(sub)) {
    tags.push("survey_poll")
  }

  // petition: sign a petition or pledge
  if (/\bsign (our |this |the )?(petition|pledge)\b/i.test(text) || /\bpetition\b/i.test(sub)) {
    tags.push("petition")
  }

  // event_invite: rally, town hall, event invitation
  if (/\b(join (us|me) (at|for)|you.re invited|rsvp|register (now|today|here)|rally|town hall|watch party|meet.and.greet|fundraiser (dinner|event)|come (join|meet)|event (tonight|tomorrow|this week))\b/i.test(text)) {
    tags.push("event_invite")
  }

  // thank_you: gratitude as primary theme
  if (/\b(thank you|thanks? so much|we.re grateful|grateful for your|incredible support|you did it|we hit our goal|we reached|you helped us)\b/i.test(text) &&
      !tags.includes("urgency_deadline")) {
    tags.push("thank_you")
  }

  // merchandise: actual merch items
  if (/\b(t-shirt|tee shirt|hat|mug|merch|store|shop now|gear|hoodie|bumper sticker)\b/i.test(text)) {
    tags.push("merchandise")
  }

  // membership_offer: recurring giving club
  if (/\b(recurring (gift|donor|giving)|monthly (donor|giving|gift)|sustaining (donor|member)|join (our )?(club|team|inner circle)|become a (monthly|sustaining)|membership)\b/i.test(text)) {
    tags.push("membership_offer")
  }

  // If we matched at least one tag with high confidence, return without AI
  if (tags.length >= 1) return tags

  return null // Fall through to AI only if nothing matched
}

const classificationSchema = z.object({
  types: z
    .array(z.string())
    .describe("1–3 message type tags from the allowed list that best describe this email"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe("1–2 sentence explanation of why these tags were chosen"),
})

export interface ClassificationResult {
  types: string[]
  reasoning: string
}

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
): Promise<ClassificationResult> {
  // 1. Try quick regex path first
  const quick = quickClassify(subject, preview)
  if (quick) return { types: quick, reasoning: "Matched via regex pattern (no AI call needed)." }

  // 2. AI classification
  try {
    const result = await generateObject({
      model: "openai/gpt-4o-mini",
      mode: "json",
      schema: classificationSchema,
      prompt: `You are classifying a political fundraising email into message type tags.

ALLOWED TAGS (pick 1–3 that best apply):
${allowedTypes.map((t) => `- ${t}`).join("\n")}

SUBJECT: ${subject}

EMAIL PREVIEW:
${preview.slice(0, 800)}

Rules:
- "urgency_deadline" = the email mentions ANY deadline, expiration, limited time, end-of-month, FEC deadline, midnight cutoff, hours left, "before it's too late", "running out of time", or countdown. Apply liberally — this is the most common tag. Even a single sentence about a deadline qualifies.
- "match_offer" = a matching gift offer is explicitly mentioned (e.g. "your gift will be matched", "match expires").
- "attack_opposition" = the PRIMARY and DOMINANT purpose is attacking or going negative on an opponent or party. Mentioning an opponent as context does NOT qualify — the email must be fundamentally hostile in tone throughout.
- "personal_story" = the sender shares a meaningful personal experience, biography, or emotional narrative as a major theme (e.g. Jan 6, military service, family story, candidate origin story).
- "news_update" = the email is sharing news, poll results, campaign updates, endorsements, or milestones — even if there is a donation ask. Apply this if the email has substantial informational content.
- "thank_you" = the email's primary or opening theme is thanking supporters, celebrating a milestone, or expressing gratitude — even if a donation ask follows.
- "event_invite" = the email invites supporters to attend a rally, town hall, watch party, or event.
- "survey_poll" = the primary ask is to complete a survey or poll, not just a passing mention of polling data.
- "membership_offer" = promoting a recurring giving club, membership tier, or sustainer program.
- "merchandise" = promoting campaign merchandise, gear, or a store.
- "petition" = the primary ask is to sign a petition or pledge.
- IMPORTANT: You MUST return at least 1 tag. Every political email fits at least one category. If the email has urgency or deadline language anywhere, always include "urgency_deadline". If it shares news or updates, include "news_update". When in doubt between two tags, include both.
- An email can have multiple tags (up to 3). A fundraising email with a midnight deadline and a personal story gets "urgency_deadline" + "personal_story".
- Never apply "attack_opposition" to an email whose overall tone is positive, motivated, or personal — even if it mentions an opponent.

Return JSON with "types" (array of 1–3 tag strings from the allowed list), "confidence" (0–1), and "reasoning" (1–2 sentences explaining why these tags were chosen).`,
    })

    const types = result.object.types.filter((t) => (allowedTypes as readonly string[]).includes(t))
    const reasoning = result.object.reasoning ?? ""
    return { types, reasoning }
  } catch (error) {
    console.error("[message-classifier] AI classification failed:", error)
    return { types: [], reasoning: "" }
  }
}
