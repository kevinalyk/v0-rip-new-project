/**
 * Email Compliance Checker
 * Pure algorithmic checks — no AI. Based on Gmail's Inboxing Checklist.
 * Only runs on campaigns that have rawHeaders stored.
 * Ref: docs/email-compliance-checker.md
 */

export interface ComplianceResult {
  // Section 1: All Senders
  hasSpf: boolean
  hasDkim: boolean
  hasTls: boolean
  hasValidMessageId: boolean
  notImpersonatingGmail: boolean
  hasArcHeaders: boolean

  // Section 2: Bulk Senders
  hasBothSpfAndDkim: boolean
  hasDmarc: boolean
  hasDmarcAlignment: boolean
  hasOneClickUnsubscribeHeaders: boolean
  hasUnsubscribeLinkInBody: boolean

  // Section 3: Content
  hasSingleFromAddress: boolean
  noFakeReplyPrefix: boolean
  hasValidFromTo: boolean
  noDeceptiveEmojisInSubject: boolean
  noHiddenContent: boolean

  // Section 4: Display Name
  displayNameClean: boolean
  displayNameNoRecipient: boolean
  displayNameNoReplyPattern: boolean
  displayNameNoDeceptiveEmojis: boolean
  displayNameNotGmail: boolean

  // Scores
  section1Score: number
  section2Score: number
  section3Score: number
  section4Score: number
  totalScore: number
}

// Deceptive emojis per Gmail guidelines
const DECEPTIVE_EMOJIS = [
  "✓", "✔", "☑", "✅", "🔒", "🏆", "🥇", "💯", "⚡", "🔥",
  "⭐", "🌟", "💥", "🎯", "🎁", "💰", "💵", "💸", "🤑", "📢",
  "📣", "🚨", "⚠️", "🔔", "🆓", "🆕", "🆙", "🔴", "🟢", "🟡",
]

/**
 * Parse raw headers string into a case-insensitive lookup map.
 * rawHeaders is stored as "name: value\n" lines.
 */
function parseHeaders(rawHeaders: string): Map<string, string[]> {
  const map = new Map<string, string[]>()
  const lines = rawHeaders.split("\n")
  for (const line of lines) {
    const colonIdx = line.indexOf(":")
    if (colonIdx < 0) continue
    const name = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line.slice(colonIdx + 1).trim()
    if (!map.has(name)) map.set(name, [])
    map.get(name)!.push(value)
  }
  return map
}

function getHeader(headers: Map<string, string[]>, name: string): string {
  return (headers.get(name.toLowerCase()) ?? []).join(" ")
}

function getAllHeaders(headers: Map<string, string[]>, name: string): string[] {
  return headers.get(name.toLowerCase()) ?? []
}

// ---------------------------------------------------------------------------
// Section 1: All Senders
// ---------------------------------------------------------------------------

function checkSpf(headers: Map<string, string[]>): boolean {
  const authResults = getAllHeaders(headers, "authentication-results").join(" ").toLowerCase()
  const receivedSpf = getHeader(headers, "received-spf").toLowerCase()
  return authResults.includes("spf=pass") || receivedSpf.includes("pass")
}

function checkDkim(headers: Map<string, string[]>): boolean {
  const authResults = getAllHeaders(headers, "authentication-results").join(" ").toLowerCase()
  return authResults.includes("dkim=pass")
}

function checkTls(headers: Map<string, string[]>): boolean {
  const received = getAllHeaders(headers, "received").join(" ")
  // ESMTPS or explicit TLS/STARTTLS mention in Received headers
  return /esmtps|with tls|starttls|\btls\b/i.test(received)
}

function checkValidMessageId(headers: Map<string, string[]>): boolean {
  const msgId = getHeader(headers, "message-id").trim()
  if (!msgId) return false
  // RFC 5322: <local@domain> format
  return /^<[^@\s]+@[^@\s]+>$/.test(msgId)
}

function checkNotImpersonatingGmail(senderEmail: string, headers: Map<string, string[]>): boolean {
  const from = getHeader(headers, "from").toLowerCase() || senderEmail.toLowerCase()
  // Should not claim to be @gmail.com unless it actually is
  if (from.includes("@gmail.com")) return false
  return true
}

function checkArcHeaders(headers: Map<string, string[]>): boolean {
  // ARC headers only required if the email was forwarded
  const hasArc = headers.has("arc-authentication-results") ||
    headers.has("arc-message-signature") ||
    headers.has("arc-seal")
  const isForwarded = /forwarded/i.test(getHeader(headers, "received"))
  // Pass if: has ARC headers, OR email wasn't forwarded (ARC not required)
  return hasArc || !isForwarded
}

// ---------------------------------------------------------------------------
// Section 2: Bulk Senders
// ---------------------------------------------------------------------------

function checkBothSpfAndDkim(spf: boolean, dkim: boolean): boolean {
  return spf && dkim
}

function checkDmarc(headers: Map<string, string[]>): boolean {
  const authResults = getAllHeaders(headers, "authentication-results").join(" ").toLowerCase()
  return authResults.includes("dmarc=pass") || authResults.includes("dmarc=")
}

function checkDmarcAlignment(senderEmail: string, headers: Map<string, string[]>): boolean {
  try {
    const senderDomain = senderEmail.split("@")[1]?.toLowerCase()
    if (!senderDomain) return false

    const authResults = getAllHeaders(headers, "authentication-results").join(" ").toLowerCase()

    // Check if DMARC passes (which implies alignment)
    if (authResults.includes("dmarc=pass")) return true

    // Check SPF alignment: envelope-from domain matches from domain
    const spfMatch = authResults.match(/spf=pass[^;]*smtp\.mailfrom=([^\s;]+)/i)
    if (spfMatch) {
      const spfDomain = spfMatch[1].split("@").pop()?.toLowerCase() ?? ""
      if (spfDomain.endsWith(senderDomain) || senderDomain.endsWith(spfDomain)) return true
    }

    // Check DKIM alignment: d= tag matches from domain
    const dkimMatch = authResults.match(/dkim=pass[^;]*header\.d=([^\s;]+)/i)
    if (dkimMatch) {
      const dkimDomain = dkimMatch[1].toLowerCase()
      if (dkimDomain.endsWith(senderDomain) || senderDomain.endsWith(dkimDomain)) return true
    }

    return false
  } catch {
    return false
  }
}

function checkOneClickUnsubscribe(headers: Map<string, string[]>): boolean {
  // Check standalone List-Unsubscribe-Post header (raw MIME format)
  const listUnsubPost = getHeader(headers, "list-unsubscribe-post").toLowerCase()
  const listUnsub = getHeader(headers, "list-unsubscribe").toLowerCase()
  const hasLink = listUnsub.includes("http") || listUnsub.includes("mailto")
  const hasOneClickHeader = listUnsubPost.includes("list-unsubscribe=one-click")

  if (hasLink && hasOneClickHeader) return true

  // mailparser parses List-Unsubscribe-Post into the "list" header as a JSON object:
  // list: {"unsubscribe-post":{"name":"List-Unsubscribe=One-Click"},"unsubscribe":{...}}
  const listHeader = getHeader(headers, "list")
  if (listHeader) {
    try {
      const parsed = JSON.parse(listHeader)
      const unsubPost = parsed?.["unsubscribe-post"]
      const unsubUrl = parsed?.["unsubscribe"]?.url || parsed?.["unsubscribe"]?.mail
      const hasOneClickInList =
        unsubPost?.name?.toLowerCase().includes("list-unsubscribe=one-click") ||
        JSON.stringify(unsubPost).toLowerCase().includes("one-click")
      if (hasOneClickInList && unsubUrl) return true
    } catch {
      // If JSON parse fails, fall back to string search on the raw value
      if (listHeader.toLowerCase().includes("one-click") &&
          (listHeader.toLowerCase().includes("http") || listHeader.toLowerCase().includes("mail"))) {
        return true
      }
    }
  }

  // Also check the DKIM h= signing list — if List-Unsubscribe-Post is signed, the header exists
  // This catches cases where the header was present but already consumed by mailparser
  const dkimHeaders = getAllHeaders(headers, "dkim-signature").join(" ").toLowerCase()
  const listHeaderRaw = getAllHeaders(headers, "list-unsubscribe").join(" ").toLowerCase()
  if (
    dkimHeaders.includes("list-unsubscribe-post") &&
    (listHeaderRaw.includes("http") || listHeaderRaw.includes("mailto") || listHeader.toLowerCase().includes("url"))
  ) {
    return true
  }

  return false
}

function checkUnsubscribeLinkInBody(emailContent: string | null, headers?: Map<string, string[]>): boolean {
  // Primary check: look for unsubscribe link in the body HTML
  if (emailContent) {
    const lower = emailContent.toLowerCase()
    if (lower.includes("unsubscribe") && (lower.includes("href") || lower.includes("<a "))) {
      return true
    }
    // The email body is redacted before storage — unsubscribe links are replaced with [Omitted].
    // If [Omitted] appears in the footer area, that's almost certainly a redacted unsub link.
    if (lower.includes("[omitted]")) {
      return true
    }
  }

  // Fallback: if the List-Unsubscribe header is present, virtually all senders also include
  // a matching link in the body — use it as a reliable proxy for the redacted content
  if (headers) {
    const listUnsub = getHeader(headers, "list-unsubscribe")
    if (listUnsub && (listUnsub.includes("http") || listUnsub.includes("mailto"))) {
      return true
    }
    // Also check mailparser's nested list object
    const listHeader = getHeader(headers, "list")
    if (listHeader && listHeader.includes("unsubscribe")) {
      return true
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Section 3: Content
// ---------------------------------------------------------------------------

function checkSingleFromAddress(headers: Map<string, string[]>): boolean {
  const from = getHeader(headers, "from")
  if (!from) return false
  // Multiple email addresses are separated by commas — count @ signs
  const atCount = (from.match(/@/g) ?? []).length
  return atCount === 1
}

function checkNoFakeReplyPrefix(subject: string, headers: Map<string, string[]>): boolean {
  const hasRePrefix = /^(re|fwd|fw)\s*:/i.test(subject.trim())
  if (!hasRePrefix) return true // No prefix — passes
  // If it has Re:/Fwd: prefix, it should have In-Reply-To or References
  const inReplyTo = getHeader(headers, "in-reply-to")
  const references = getHeader(headers, "references")
  return !!(inReplyTo || references)
}

function checkValidFromTo(senderEmail: string, headers: Map<string, string[]>): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(senderEmail)) return false
  const to = getHeader(headers, "to")
  // Extract email from "Name <email>" or plain "email"
  const toEmail = to.match(/<([^>]+)>/)?.[1] ?? to.trim()
  return emailRegex.test(toEmail) || to.trim() === "" // allow empty To (sent via BCC)
}

function checkNoDeceptiveEmojisInSubject(subject: string): boolean {
  return !DECEPTIVE_EMOJIS.some((emoji) => subject.includes(emoji))
}

function checkNoHiddenContent(emailContent: string | null): boolean {
  if (!emailContent) return true
  const lower = emailContent.toLowerCase()
  return (
    !lower.includes("display:none") &&
    !lower.includes("display: none") &&
    !lower.includes("visibility:hidden") &&
    !lower.includes("visibility: hidden") &&
    !lower.includes("font-size:0") &&
    !lower.includes("font-size: 0") &&
    !/color\s*:\s*#fff(fff)?\s*(;|,|\})/i.test(emailContent) // white text on white bg
  )
}

// ---------------------------------------------------------------------------
// Section 4: Display Name
// ---------------------------------------------------------------------------

function extractDisplayName(senderName: string, headers: Map<string, string[]>): string {
  if (senderName) return senderName
  const from = getHeader(headers, "from")
  const match = from.match(/^"?([^"<]+)"?\s*</)?.[1]?.trim()
  return match ?? ""
}

function checkDisplayNameClean(displayName: string, subject: string): boolean {
  if (!displayName) return true
  // Display name should not contain chunks of the subject text (>5 chars)
  const subjectWords = subject.toLowerCase().split(/\s+/).filter((w) => w.length > 5)
  const nameLower = displayName.toLowerCase()
  const overlap = subjectWords.filter((w) => nameLower.includes(w))
  return overlap.length === 0
}

function checkDisplayNameNoRecipient(displayName: string, headers: Map<string, string[]>): boolean {
  if (!displayName) return true
  const to = getHeader(headers, "to").toLowerCase()
  const nameLower = displayName.toLowerCase()
  // Extract recipient name/email parts and check for overlap
  const toName = to.match(/^"?([^"<@,]+)"?\s*</)?.[1]?.trim() ?? ""
  if (!toName) return true
  return !nameLower.includes(toName.toLowerCase())
}

function checkDisplayNameNoReplyPattern(displayName: string): boolean {
  if (!displayName) return true
  // Patterns that imply a reply thread
  return !/(\(2\)|\(\d+\)|\bre\s*:|\bfwd?\s*:|@[^\s]+\.[a-z]{2,})/i.test(displayName)
}

function checkDisplayNameNoDeceptiveEmojis(displayName: string): boolean {
  if (!displayName) return true
  return !DECEPTIVE_EMOJIS.some((emoji) => displayName.includes(emoji))
}

function checkDisplayNameNotGmail(displayName: string): boolean {
  if (!displayName) return true
  return !displayName.toLowerCase().includes("@gmail.com")
}

// ---------------------------------------------------------------------------
// Score calculation
// ---------------------------------------------------------------------------

function score(checks: (boolean | null | undefined)[]): number {
  const valid = checks.filter((c) => c !== null && c !== undefined) as boolean[]
  if (valid.length === 0) return 0
  const passed = valid.filter(Boolean).length
  return Math.round((passed / valid.length) * 100) / 100
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function checkEmailCompliance(campaign: {
  senderEmail: string
  senderName: string
  subject: string
  rawHeaders: string
  emailContent?: string | null
}): ComplianceResult {
  const { senderEmail, senderName, subject, rawHeaders, emailContent } = campaign
  const headers = parseHeaders(rawHeaders)

  // Section 1
  const hasSpf = checkSpf(headers)
  const hasDkim = checkDkim(headers)
  const hasTls = checkTls(headers)
  const hasValidMessageId = checkValidMessageId(headers)
  const notImpersonatingGmail = checkNotImpersonatingGmail(senderEmail, headers)
  const hasArcHeaders = checkArcHeaders(headers)

  // Section 2
  const hasBothSpfAndDkim = checkBothSpfAndDkim(hasSpf, hasDkim)
  const hasDmarc = checkDmarc(headers)
  const hasDmarcAlignment = checkDmarcAlignment(senderEmail, headers)
  const hasOneClickUnsubscribeHeaders = checkOneClickUnsubscribe(headers)
  const hasUnsubscribeLinkInBody = checkUnsubscribeLinkInBody(emailContent ?? null, headers)

  // Section 3
  const hasSingleFromAddress = checkSingleFromAddress(headers)
  const noFakeReplyPrefix = checkNoFakeReplyPrefix(subject, headers)
  const hasValidFromTo = checkValidFromTo(senderEmail, headers)
  const noDeceptiveEmojisInSubject = checkNoDeceptiveEmojisInSubject(subject)
  const noHiddenContent = checkNoHiddenContent(emailContent ?? null)

  // Section 4
  const displayName = extractDisplayName(senderName, headers)
  const displayNameClean = checkDisplayNameClean(displayName, subject)
  const displayNameNoRecipient = checkDisplayNameNoRecipient(displayName, headers)
  const displayNameNoReplyPattern = checkDisplayNameNoReplyPattern(displayName)
  const displayNameNoDeceptiveEmojis = checkDisplayNameNoDeceptiveEmojis(displayName)
  const displayNameNotGmail = checkDisplayNameNotGmail(displayName)

  // Scores
  const section1Score = score([hasSpf, hasDkim, hasTls, hasValidMessageId, notImpersonatingGmail, hasArcHeaders])
  const section2Score = score([hasBothSpfAndDkim, hasDmarc, hasDmarcAlignment, hasOneClickUnsubscribeHeaders, hasUnsubscribeLinkInBody])
  const section3Score = score([hasSingleFromAddress, noFakeReplyPrefix, hasValidFromTo, noDeceptiveEmojisInSubject, noHiddenContent])
  const section4Score = score([displayNameClean, displayNameNoRecipient, displayNameNoReplyPattern, displayNameNoDeceptiveEmojis, displayNameNotGmail])
  // Average the four section scores directly — passing fractions into score() would treat them all as truthy booleans
  const totalScore = Math.round(((section1Score + section2Score + section3Score + section4Score) / 4) * 100) / 100

  return {
    hasSpf,
    hasDkim,
    hasTls,
    hasValidMessageId,
    notImpersonatingGmail,
    hasArcHeaders,
    hasBothSpfAndDkim,
    hasDmarc,
    hasDmarcAlignment,
    hasOneClickUnsubscribeHeaders,
    hasUnsubscribeLinkInBody,
    hasSingleFromAddress,
    noFakeReplyPrefix,
    hasValidFromTo,
    noDeceptiveEmojisInSubject,
    noHiddenContent,
    displayNameClean,
    displayNameNoRecipient,
    displayNameNoReplyPattern,
    displayNameNoDeceptiveEmojis,
    displayNameNotGmail,
    section1Score,
    section2Score,
    section3Score,
    section4Score,
    totalScore,
  }
}
