/**
 * Subject Line Pattern Classifier — Feature #3
 *
 * Pure string logic — no AI, no external calls, deterministic.
 * Each pattern is unambiguous and detectable with a single regex or string check.
 *
 * Returns an array of pattern keys that match the given subject line.
 */

export const SUBJECT_PATTERNS = {
  all_caps: {
    label: "All Caps",
    description: "Entire subject is uppercase",
  },
  caps_word: {
    label: "Caps Word(s)",
    description: "One or more ALL-CAPS words in a mixed-case subject",
  },
  question: {
    label: "Question",
    description: "Ends with a question mark",
  },
  exclamation: {
    label: "Exclamation",
    description: "Ends with an exclamation mark",
  },
  short: {
    label: "Short (<30 chars)",
    description: "Under 30 characters",
  },
  long: {
    label: "Long (>70 chars)",
    description: "Over 70 characters",
  },
  emoji: {
    label: "Emoji",
    description: "Contains one or more Unicode emoji",
  },
  personalization: {
    label: "Personalization Token",
    description: "Contains a merge tag like {{Name}}, [NAME], {first_name}, or [Omitted]",
  },
  number_dollar: {
    label: "Dollar Amount",
    description: "Contains a dollar figure like $5, $5,000, or $8 million",
  },
  urgency: {
    label: "Urgency / Deadline",
    description: 'Contains urgency language like "deadline", "expires", "hours left", "last chance"',
  },
} as const

export type SubjectPattern = keyof typeof SUBJECT_PATTERNS

// Emoji detection: covers common Unicode emoji ranges
const EMOJI_REGEX =
  /[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]/u

// Merge tag patterns: {{Name}}, {{first_name}}, {first_name}, [NAME], [FIRST NAME], [Omitted]
// Must look like an actual merge/personalization field — not generic bracketed phrases.
// Allowed: [NAME], [FIRST NAME], [FIRST_NAME], {{anything}}, {snake_case}, [Omitted]
const PERSONALIZATION_REGEX =
  /\{\{[^}]+\}\}|\{[a-zA-Z_]+\}|\[(?:Omitted|NAME|FIRST[\s_]NAME|LAST[\s_]NAME|FULL[\s_]NAME|FNAME|LNAME|SUBSCRIBER[\s_]NAME|first[\s_]name|last[\s_]name|full[\s_]name)\]/i

// Dollar amounts only: $5, $5,000, $5.00, $8 million, $8M — NOT bare numbers, times, or counts
const NUMBER_DOLLAR_REGEX =
  /\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|thousand|k|M|B))?\b/i

// Urgency/deadline language
const URGENCY_REGEX =
  /\b(?:deadline|expires?|expiring|expiration|hours?\s+left|last\s+chance|final\s+(?:hours?|day|call|chance)|ends?\s+(?:soon|tonight|today|at\s+midnight)|running\s+out|time(?:'s)?\s+(?:is\s+)?running|don'?t\s+(?:miss|wait)|act\s+now|hurry|urgent|critical|warning|alert|important|immediate|only\s+\d+\s+(?:hours?|days?|minutes?)\s+left)\b/i

// ALL-CAPS word: 3+ uppercase letters, no lowercase, no digits-only
// Must be a real word (not just punctuation or numbers)
const CAPS_WORD_REGEX = /\b[A-Z]{3,}\b/

/**
 * Classify a subject line into zero or more pattern keys.
 * Returns a sorted array of pattern keys.
 */
export function classifySubjectLine(subject: string): SubjectPattern[] {
  if (!subject || subject.trim().length === 0) return []

  const trimmed = subject.trim()
  const patterns: SubjectPattern[] = []

  // Length checks
  if (trimmed.length < 30) patterns.push("short")
  if (trimmed.length > 70) patterns.push("long")

  // Question / exclamation — check last non-whitespace character
  const lastChar = trimmed[trimmed.length - 1]
  if (lastChar === "?") patterns.push("question")
  if (lastChar === "!") patterns.push("exclamation")

  // Emoji
  if (EMOJI_REGEX.test(trimmed)) patterns.push("emoji")

  // Personalization
  if (PERSONALIZATION_REGEX.test(trimmed)) patterns.push("personalization")

  // Dollar / number
  if (NUMBER_DOLLAR_REGEX.test(trimmed)) patterns.push("number_dollar")

  // Urgency
  if (URGENCY_REGEX.test(trimmed)) patterns.push("urgency")

  // All caps: strip emoji/punctuation/spaces and check if every letter is uppercase
  const lettersOnly = trimmed.replace(EMOJI_REGEX, "").replace(/[^a-zA-Z]/g, "")
  if (lettersOnly.length > 0 && lettersOnly === lettersOnly.toUpperCase()) {
    patterns.push("all_caps")
  } else if (CAPS_WORD_REGEX.test(trimmed)) {
    // Only flag caps_word when the subject is NOT all-caps (avoid double-tagging)
    patterns.push("caps_word")
  }

  return patterns.sort()
}
