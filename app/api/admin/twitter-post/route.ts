import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { nanoid } from "nanoid"
import crypto from "crypto"

// ── OAuth 1.0a helper ────────────────────────────────────────────────────────

function oauthSign(method: string, url: string, params: Record<string, string>, consumerSecret: string, tokenSecret: string): string {
  const sortedParams = Object.keys(params)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join("&")

  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`
  return crypto.createHmac("sha1", signingKey).update(baseString).digest("base64")
}

function buildOauthHeader(method: string, url: string, consumerKey: string, consumerSecret: string, accessToken: string, accessSecret: string): string {
  const oauthParams: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: nanoid(32),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: "1.0",
  }

  oauthParams.oauth_signature = oauthSign(method, url, oauthParams, consumerSecret, accessSecret)

  const headerValue = Object.keys(oauthParams)
    .map((k) => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(", ")

  return `OAuth ${headerValue}`
}

// ── Excerpt extraction ────────────────────────────────────────────────────────

/**
 * Extracts a clean, meaningful excerpt from email preview or SMS message text.
 * - Strips common political fundraising boilerplate from the end (unsubscribe lines, legal disclaimers, etc.)
 * - Prefers the first complete sentence(s) that fit within maxChars
 * - Falls back to a clean word-boundary truncation if no sentence boundary is found
 */
function extractExcerpt(text: string, maxChars: number): string {
  // Normalize whitespace
  let cleaned = text.replace(/\s+/g, " ").trim()

  // Strip common trailing boilerplate patterns (unsubscribe lines, legal, etc.)
  const boilerplatePatterns = [
    /unsubscribe.{0,120}$/i,
    /opt.?out.{0,120}$/i,
    /paid for by.{0,200}$/i,
    /not authorized by any.{0,200}$/i,
    /this email was sent.{0,200}$/i,
    /to stop receiving.{0,120}$/i,
    /privacy policy.{0,120}$/i,
    /view( this)? (email|message) (in|on).{0,60}$/i,
    /\bpolitical ad\b.{0,60}$/i,
    /reply stop.{0,80}$/i,
    /msg &? ?data rates.{0,80}$/i,
    /txt stop.{0,80}$/i,
    /terms( of service)?.{0,80}$/i,
  ]

  for (const pattern of boilerplatePatterns) {
    cleaned = cleaned.replace(pattern, "").trim()
  }

  // If already short enough, return as-is
  if (cleaned.length <= maxChars) return cleaned

  // Try to end on a complete sentence within the limit
  const truncated = cleaned.slice(0, maxChars)
  const lastSentence = truncated.search(/[.!?][^.!?]*$/)
  if (lastSentence > maxChars * 0.4) {
    // found a sentence end that uses at least 40% of the budget — use it
    return cleaned.slice(0, lastSentence + 1).trim()
  }

  // Fall back to word boundary
  const lastSpace = truncated.lastIndexOf(" ")
  return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated).trim() + "…"
}

// ── Tweet builder ─────────────────────────────────────────────────────────────

/**
 * Builds the single tweet format: "From [Name]: [excerpt] [url]"
 * The URL is ~23 chars when t.co-shortened. We budget 25 to be safe.
 * Total tweet limit: 280 chars.
 */
function buildTweetText(entityName: string, excerpt: string, url: string): string {
  const prefix = `From ${entityName}: `
  const suffix = ` ${url}`
  const maxExcerpt = 280 - prefix.length - suffix.length - 25 // 25 char t.co buffer

  let finalExcerpt = excerpt
  if (excerpt.length > maxExcerpt) {
    // Re-truncate to fit
    const cut = excerpt.slice(0, maxExcerpt)
    const lastSpace = cut.lastIndexOf(" ")
    finalExcerpt = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + "…"
  }

  return `${prefix}${finalExcerpt}${suffix}`
}

// ── Last posted party lookup ──────────────────────────────────────────────────

/**
 * Returns the party of the most recently Twitter-posted item ("republican" | "democrat" | null).
 * Used to softly alternate between parties when possible.
 */
async function getLastPostedParty(): Promise<string | null> {
  // Check most recent email post
  const lastEmail = await prisma.competitiveInsightCampaign.findFirst({
    where: { twitterPostedAt: { not: null }, entity: { party: { not: null } } },
    orderBy: { twitterPostedAt: "desc" },
    select: { entity: { select: { party: true } } },
  })

  // Check most recent SMS post
  const lastSms = await prisma.smsQueue.findFirst({
    where: { twitterPostedAt: { not: null }, entity: { party: { not: null } } },
    orderBy: { twitterPostedAt: "desc" },
    select: { entity: { select: { party: true } }, twitterPostedAt: true },
  })

  const lastEmailPostedAt = lastEmail ? (await prisma.competitiveInsightCampaign.findFirst({
    where: { twitterPostedAt: { not: null } },
    orderBy: { twitterPostedAt: "desc" },
    select: { twitterPostedAt: true },
  }))?.twitterPostedAt : null

  const lastSmsPostedAt = lastSms?.twitterPostedAt ?? null

  if (!lastEmail && !lastSms) return null

  // Return whichever was more recent
  if (lastEmailPostedAt && lastSmsPostedAt) {
    return lastEmailPostedAt > lastSmsPostedAt
      ? (lastEmail?.entity?.party ?? null)
      : (lastSms?.entity?.party ?? null)
  }
  if (lastEmailPostedAt) return lastEmail?.entity?.party ?? null
  if (lastSmsPostedAt) return lastSms?.entity?.party ?? null
  return null
}

// ── Shared post logic ─────────────────────────────────────────────────────────

export async function runTwitterPost(options: { dryRun?: boolean } = {}): Promise<{
  success: boolean
  tweetUrl?: string
  tweetText?: string
  entity?: string
  type?: string
  score?: number
  shareUrl?: string
  candidatesEvaluated?: number
  lastParty?: string | null
  selectedParty?: string | null
  error?: string
  detail?: unknown
  status: number
}> {
  const consumerKey = process.env.TWITTER_CONSUMER_KEY
  const consumerSecret = process.env.TWITTER_CONSUMER_SECRET
  const accessToken = process.env.TWITTER_ACCESS_TOKEN
  const accessSecret = process.env.TWITTER_ACCESS_SECRET

  if (!consumerKey || !consumerSecret || !accessToken || !accessSecret) {
    return { success: false, error: "Twitter API credentials not configured", status: 500 }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // ── Fetch last posted party for alternation logic ─────────────────────
  const lastParty = await getLastPostedParty()
  // TODO: re-enable Democrat alternation when ready
  // const preferredParty = lastParty === "republican" ? "democrat" : lastParty === "democrat" ? "republican" : null
  const preferredParty: string | null = null

  // ── Fetch candidates — WinRed only (ActBlue commented out for now) ───
  const emailCandidates = await prisma.competitiveInsightCampaign.findMany({
    where: {
      twitterPostedAt: null,
      isDeleted: false,
      isHidden: false,
      createdAt: { gte: since },
      entityId: { not: null },
      donationPlatform: { in: ["winred" /*, "actblue"*/] },
    },
    select: {
      id: true,
      shareToken: true,
      viewCount: true,
      shareCount: true,
      shareViewCount: true,
      emailPreview: true,
      entity: {
        select: {
          id: true,
          name: true,
          party: true,
          _count: { select: { subscriptions: true } },
        },
      },
    },
    take: 200,
  })

  const smsCandidates = await prisma.smsQueue.findMany({
    where: {
      twitterPostedAt: null,
      isDeleted: false,
      isHidden: false,
      createdAt: { gte: since },
      entityId: { not: null },
      assignmentMethod: { in: ["auto_winred" /*, "auto_actblue"*/] },
    },
    select: {
      id: true,
      shareToken: true,
      viewCount: true,
      shareCount: true,
      shareViewCount: true,
      message: true,
      entity: {
        select: {
          id: true,
          name: true,
          party: true,
          _count: { select: { subscriptions: true } },
        },
      },
    },
    take: 200,
  })

  type Candidate = {
    id: string
    shareToken: string | null
    viewCount: number | null
    shareCount: number | null
    shareViewCount: number | null
    bodyText: string | null
    entity: { id: string; name: string; party: string | null; _count: { subscriptions: number } } | null
    isSms: boolean
    score: number
  }

  const scoreItem = (c: Omit<Candidate, "score" | "isSms" | "bodyText">): number =>
    (c.shareViewCount ?? 0) * 3 +
    (c.shareCount ?? 0) * 2 +
    (c.viewCount ?? 0) * 1 +
    (c.entity?._count?.subscriptions ?? 0) * 2

  const allCandidates: Candidate[] = [
    ...emailCandidates
      .filter((c) => c.entity && (c.emailPreview ?? "").trim().length > 20)
      .map((c) => ({ ...c, bodyText: c.emailPreview ?? null, isSms: false, score: scoreItem(c) })),
    ...smsCandidates
      .filter((c) => c.entity && (c.message ?? "").trim().length > 20)
      .map((c) => ({ ...c, bodyText: c.message ?? null, isSms: true, score: scoreItem(c) })),
  ].sort((a, b) => b.score - a.score)

  if (allCandidates.length === 0) {
    return { success: false, error: "No eligible candidates found in the last 24 hours", status: 404 }
  }

  // ── Party alternation: try preferred party first, fall back to any ────
  const preferredCandidates = preferredParty
    ? allCandidates.filter((c) => c.entity?.party === preferredParty)
    : []

  const winner = preferredCandidates.length > 0 ? preferredCandidates[0] : allCandidates[0]
  const selectedParty = winner.entity?.party ?? null

  // ── Ensure share token ────────────────────────────────────────────────
  let shareToken = winner.shareToken
  if (!shareToken) {
    shareToken = nanoid(16)
    if (winner.isSms) {
      await prisma.smsQueue.update({ where: { id: winner.id }, data: { shareToken, shareTokenCreatedAt: new Date(), shareTokenSource: "Twitter" } })
    } else {
      await prisma.competitiveInsightCampaign.update({ where: { id: winner.id }, data: { shareToken, shareTokenCreatedAt: new Date(), shareTokenSource: "Twitter" } })
    }
  }

  const shareUrl = `${baseUrl}/share/${shareToken}`
  const entityName = winner.entity!.name
  const rawText = winner.bodyText ?? ""
  // Budget: 280 total - prefix "From X: " - suffix " url(~25)" ≈ 200 chars for excerpt
  const excerpt = extractExcerpt(rawText, 200)
  const tweetText = buildTweetText(entityName, excerpt, shareUrl)

  if (options.dryRun) {
    return {
      success: true,
      tweetText,
      entity: entityName,
      type: winner.isSms ? "sms" : "email",
      score: winner.score,
      shareUrl,
      candidatesEvaluated: allCandidates.length,
      lastParty,
      selectedParty,
      status: 200,
    }
  }

  // ── Pre-warm the OG image so Twitter's crawler gets it on first scrape ──
  try {
    const ogUrl = `${baseUrl}/api/og/share/${shareToken}`
    console.log("[twitter-post] Pre-warming OG image:", ogUrl)
    await fetch(ogUrl, { method: "GET" })
    // Give Vercel's image cache a moment to settle before Twitter scrapes
    await new Promise((resolve) => setTimeout(resolve, 3000))
    console.log("[twitter-post] OG image pre-warm complete")
  } catch (err) {
    // Non-fatal — log and continue
    console.warn("[twitter-post] OG pre-warm failed (non-fatal):", err)
  }

  // ── Post to Twitter v2 ────────────────────────────────────────────────
  const twitterUrl = "https://api.twitter.com/2/tweets"
  const oauthHeader = buildOauthHeader("POST", twitterUrl, consumerKey, consumerSecret, accessToken, accessSecret)

  const twitterRes = await fetch(twitterUrl, {
    method: "POST",
    headers: {
      Authorization: oauthHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: tweetText }),
  })

  const twitterData = await twitterRes.json()

  if (!twitterRes.ok) {
    console.error("[twitter-post] Twitter API error:", twitterData)
    return { success: false, error: "Twitter API error", detail: twitterData, status: 502 }
  }

  // ── Mark as posted ────────────────────────────────────────────────────
  const now = new Date()
  if (winner.isSms) {
    await prisma.smsQueue.update({ where: { id: winner.id }, data: { twitterPostedAt: now } })
  } else {
    await prisma.competitiveInsightCampaign.update({ where: { id: winner.id }, data: { twitterPostedAt: now } })
  }

  const tweetId = twitterData.data?.id
  const tweetUrl = tweetId ? `https://twitter.com/i/web/status/${tweetId}` : null

  return {
    success: true,
    tweetUrl: tweetUrl ?? undefined,
    tweetText,
    entity: entityName,
    type: winner.isSms ? "sms" : "email",
    score: winner.score,
    shareUrl,
    candidatesEvaluated: allCandidates.length,
    lastParty,
    selectedParty,
    status: 200,
  }
}

// ── Admin handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dryRun = body?.dryRun === true

    const result = await runTwitterPost({ dryRun })
    return NextResponse.json(result, { status: result.status })
  } catch (error) {
    console.error("[twitter-post] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
