/**
 * Body fingerprinting for email and SMS similarity detection.
 *
 * Email strategy:
 * 1. Strip all HTML tags, CSS, and boilerplate
 * 2. Normalize personalized tokens (names, amounts, URLs)
 * 3. Build a set of overlapping 5-word shingles
 * 4. Jaccard similarity = |A ∩ B| / |A ∪ B|, threshold 0.65
 *
 * SMS strategy:
 * 1. Plain text — skip HTML stripping entirely
 * 2. Same normalization (URLs, amounts, names)
 * 3. 3-word shingles (messages are short; 5-word shingles are too sparse)
 * 4. Jaccard threshold 0.55 (lower because short texts have naturally lower max Jaccard)
 */

export const SIMILARITY_THRESHOLD = 0.65
export const SMS_SIMILARITY_THRESHOLD = 0.55

/**
 * Extract unique image src URLs from HTML and return a stable token string.
 * Strips tracking query params (utm_*, etc.) so minor URL variations don't create false differences.
 * Each distinct image path becomes a synthetic token like __img_0__, __img_1__, etc.
 */
function extractImageTokens(html: string): string {
  const srcPattern = /<img[^>]+src=["']([^"']+)["']/gi
  const seen = new Set<string>()
  let match: RegExpExecArray | null
  while ((match = srcPattern.exec(html)) !== null) {
    try {
      const url = new URL(match[1])
      // Drop tracking query params, keep protocol + host + pathname as the identity
      const normalized = `${url.protocol}//${url.host}${url.pathname}`
      seen.add(normalized)
    } catch {
      // If URL parsing fails, use the raw value stripped of query string
      const raw = match[1].split("?")[0]
      if (raw) seen.add(raw)
    }
  }
  if (seen.size === 0) return ""
  // Sort for determinism, then join as space-separated synthetic tokens
  return [...seen].sort().map((_, i) => `__img_${i}__`).join(" ")
}

/** Strip HTML and extract readable text */
function stripHtml(html: string): string {
  return html
    // Remove <style>...</style> blocks entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    // Remove <script>...</script> blocks entirely
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    // Remove hidden preview-text divs — catches display:none, max-height:0/0px, opacity:0, overflow:hidden combos
    .replace(/<div[^>]*(?:display\s*:\s*none|max-height\s*:\s*0\s*(?:px)?;?|opacity\s*:\s*0)[^>]*>[\s\S]*?<\/div>/gi, " ")
    // Replace block-level closing tags with spaces
    .replace(/<\/(p|div|li|tr|td|th|br|h[1-6]|blockquote)[^>]*>/gi, " ")
    // Strip remaining tags
    .replace(/<[^>]+>/g, "")
    // Decode common HTML entities
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&[a-z]+;/gi, " ")
    // Remove zero-width and invisible Unicode spacers used for preview text padding
    .replace(/[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF\uFFA0]/g, "")
    // Remove ## repeated symbol patterns used as preview text padding
    .replace(/(#\s*){2,}/g, " ")
}

/** Normalize text to strip personalization and boilerplate */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    // Strip FreeMarker template blocks: <#if ...>...</#if>, <#else>, ${...}
    .replace(/<#[^>]*>/g, " ")
    .replace(/<\/#[^>]*>/g, " ")
    .replace(/\$\{[^}]*\}/g, " ")
    // Strip any leftover < > angle-bracket constructs that aren't real words
    .replace(/<[^>]{0,80}>/g, " ")
    // Remove [Omitted] placeholder tokens
    .replace(/\[omitted\]/gi, " ")
    // Remove URLs
    .replace(/https?:\/\/[^\s]+/g, "__url__")
    // Remove email addresses
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g, "__email__")
    // Remove dollar amounts
    .replace(/\$[\d,]+(\.\d{2})?/g, "__amt__")
    // Normalize plain numbers that look like counts/IDs
    .replace(/\b\d{5,}\b/g, "__num__")
    // Remove names after greeting patterns (Hey Jason, / Hi Mike,)
    .replace(/\b(hey|hi|hello|dear|greetings)\s+[a-z'-]+[,!]?/g, "__greeting__")
    // Strip common email footer boilerplate
    .replace(/(unsubscribe|manage preferences|view in browser|privacy policy|terms of service|paid for by|disclaimer)[^\n]*/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim()
}

/** Build a set of overlapping n-word shingles from text */
function shingle(text: string, n = 5): Set<string> {
  const words = text.split(" ").filter((w) => w.length > 1)
  const shingles = new Set<string>()
  for (let i = 0; i <= words.length - n; i++) {
    shingles.add(words.slice(i, i + n).join(" "))
  }
  return shingles
}

/** Jaccard similarity between two shingle sets */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const s of a) {
    if (b.has(s)) intersection++
  }
  const union = a.size + b.size - intersection
  return intersection / union
}

/**
 * Compute a compact fingerprint from raw email HTML.
 * Image src URLs are extracted first and prepended as synthetic tokens so that
 * two emails with identical HTML structure but different hero images get distinct fingerprints.
 * Returns a JSON array of the shingles (sorted for determinism).
 */
export function computeBodyFingerprint(html: string): string {
  if (!html?.trim()) return "[]"
  const imageTokens = extractImageTokens(html)
  const bodyText = normalizeText(stripHtml(html))
  // Prepend image tokens so they participate in shingling alongside body text
  const text = imageTokens ? `${imageTokens} ${bodyText}` : bodyText
  // Need at least ~40 chars of real content to be meaningful
  if (text.length < 40) return "[]"
  const shingles = shingle(text, 5)
  if (shingles.size === 0) return "[]"
  return JSON.stringify([...shingles].sort())
}

/**
 * Compute a compact fingerprint from a raw SMS message body (plain text).
 * Uses 3-word shingles for better coverage on short messages.
 * Returns a JSON array of shingles (sorted for determinism).
 */
export function computeSmsFingerprint(message: string): string {
  if (!message?.trim()) return "[]"
  const text = normalizeText(message) // no HTML stripping needed
  if (text.length < 20) return "[]"
  const shingles = shingle(text, 3) // 3-word shingles for short texts
  if (shingles.size === 0) return "[]"
  return JSON.stringify([...shingles].sort())
}

/**
 * Parse a stored fingerprint string back into a shingle Set.
 */
export function parseFingerprint(fp: string | null | undefined): Set<string> {
  if (!fp || fp === "[]") return new Set()
  try {
    return new Set(JSON.parse(fp) as string[])
  } catch {
    return new Set()
  }
}
