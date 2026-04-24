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

// ── Tweet templates ───────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = [
  (name: string, url: string) => `${name} just sent this fundraising email. Take a look: ${url}`,
  (name: string, url: string) => `Here's what ${name} is sending to their list right now: ${url}`,
  (name: string, url: string) => `${name}'s latest fundraising email just dropped: ${url}`,
  (name: string, url: string) => `Caught in the wild: a fundraising email from ${name}. ${url}`,
  (name: string, url: string) => `${name} is hitting inboxes. Here's what they're saying: ${url}`,
]

const SMS_TEMPLATES = [
  (name: string, url: string) => `${name} just sent this text to their supporters: ${url}`,
  (name: string, url: string) => `Here's what ${name} is texting right now: ${url}`,
  (name: string, url: string) => `${name}'s latest fundraising text: ${url}`,
  (name: string, url: string) => `Caught in the wild: a fundraising text from ${name}. ${url}`,
  (name: string, url: string) => `${name} is hitting phones. Here's what they're saying: ${url}`,
]

function pickTemplate(templates: Array<(n: string, u: string) => string>, name: string, url: string): string {
  return templates[Math.floor(Math.random() * templates.length)](name, url)
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const consumerKey = process.env.TWITTER_CONSUMER_KEY
    const consumerSecret = process.env.TWITTER_CONSUMER_SECRET
    const accessToken = process.env.TWITTER_ACCESS_TOKEN
    const accessSecret = process.env.TWITTER_ACCESS_SECRET

    if (!consumerKey || !consumerSecret || !accessToken || !accessSecret) {
      return NextResponse.json({ error: "Twitter API credentials not configured" }, { status: 500 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000) // last 24 hours

    // ── Score and pick best email from last 24h ───────────────────────────
    const emailCandidates = await prisma.competitiveInsightCampaign.findMany({
      where: {
        twitterPosted: false,
        isDeleted: false,
        createdAt: { gte: since },
        entityId: { not: null },
        type: "email",
      },
      select: {
        id: true,
        shareToken: true,
        viewCount: true,
        shareCount: true,
        shareViewCount: true,
        entity: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
            _count: { select: { subscriptions: true } },
          },
        },
      },
      take: 200,
    })

    // ── Score and pick best SMS from last 24h ─────────────────────────────
    const smsCandidates = await prisma.smsQueue.findMany({
      where: {
        twitterPosted: false,
        isDeleted: false,
        createdAt: { gte: since },
        entityId: { not: null },
      },
      select: {
        id: true,
        shareToken: true,
        viewCount: true,
        shareCount: true,
        shareViewCount: true,
        entity: {
          select: {
            id: true,
            name: true,
            imageUrl: true,
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
      entity: { id: string; name: string; imageUrl: string | null; _count: { subscriptions: number } } | null
      isSms: boolean
      score: number
    }

    const score = (c: Omit<Candidate, "score" | "isSms">): number =>
      (c.shareViewCount ?? 0) * 3 +
      (c.shareCount ?? 0) * 2 +
      (c.viewCount ?? 0) * 1 +
      (c.entity?._count?.subscriptions ?? 0) * 2

    const allCandidates: Candidate[] = [
      ...emailCandidates.filter((c) => c.entity).map((c) => ({ ...c, isSms: false, score: score(c) })),
      ...smsCandidates.filter((c) => c.entity).map((c) => ({ ...c, isSms: true, score: score(c) })),
    ].sort((a, b) => b.score - a.score)

    if (allCandidates.length === 0) {
      return NextResponse.json({ error: "No eligible candidates found in the last 24 hours" }, { status: 404 })
    }

    const winner = allCandidates[0]

    // ── Ensure share token ────────────────────────────────────────────────
    let shareToken = winner.shareToken
    if (!shareToken) {
      shareToken = nanoid(16)
      if (winner.isSms) {
        await prisma.smsQueue.update({ where: { id: winner.id }, data: { shareToken, shareTokenCreatedAt: new Date() } })
      } else {
        await prisma.competitiveInsightCampaign.update({ where: { id: winner.id }, data: { shareToken, shareTokenCreatedAt: new Date() } })
      }
    }

    const shareUrl = `${baseUrl}/share/${shareToken}`
    const entityName = winner.entity!.name
    const templates = winner.isSms ? SMS_TEMPLATES : EMAIL_TEMPLATES
    const tweetText = pickTemplate(templates, entityName, shareUrl)

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
      return NextResponse.json({ error: "Twitter API error", detail: twitterData }, { status: 502 })
    }

    // ── Mark as posted ────────────────────────────────────────────────────
    const now = new Date()
    if (winner.isSms) {
      await prisma.smsQueue.update({ where: { id: winner.id }, data: { twitterPosted: true, twitterPostedAt: now } })
    } else {
      await prisma.competitiveInsightCampaign.update({ where: { id: winner.id }, data: { twitterPosted: true, twitterPostedAt: now } })
    }

    const tweetId = twitterData.data?.id
    const tweetUrl = tweetId ? `https://twitter.com/i/web/status/${tweetId}` : null

    return NextResponse.json({
      success: true,
      tweetUrl,
      tweetText,
      entity: entityName,
      type: winner.isSms ? "sms" : "email",
      score: winner.score,
      shareUrl,
      candidatesEvaluated: allCandidates.length,
    })
  } catch (error) {
    console.error("[twitter-post] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
