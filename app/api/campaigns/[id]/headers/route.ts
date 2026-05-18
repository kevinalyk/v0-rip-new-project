import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export interface ParsedHeader {
  name: string
  value: string
  category: "auth" | "routing" | "identity" | "other"
  status?: "pass" | "fail" | "neutral"
}

// Parse raw header string into structured key/value pairs
function parseRawHeaders(raw: string): ParsedHeader[] {
  // The rawHeaders field sometimes contains the full email (body + headers concatenated).
  // Headers always start with a "Header-Name: value" pattern. Find the first line that
  // looks like a real email header (Received:, Authentication-Results:, DKIM-Signature:, etc.)
  // and slice from there.
  const lines = raw.split(/\r?\n/)
  const HEADER_START_RE = /^[A-Za-z0-9\-]+\s*:/
  const firstHeaderIdx = lines.findIndex((l) => HEADER_START_RE.test(l))
  const headerLines = firstHeaderIdx >= 0 ? lines.slice(firstHeaderIdx) : lines

  // Stop at the first blank line (separates headers from body)
  const blankIdx = headerLines.findIndex((l) => l.trim() === "")
  const onlyHeaderLines = blankIdx >= 0 ? headerLines.slice(0, blankIdx) : headerLines

  const headers: { name: string; value: string }[] = []
  let current: { name: string; value: string } | null = null

  for (const line of onlyHeaderLines) {
    if (/^\s/.test(line)) {
      // Continuation line
      if (current) current.value += " " + line.trim()
    } else {
      if (current) headers.push(current)
      const colon = line.indexOf(":")
      if (colon > 0) {
        current = {
          name: line.slice(0, colon).trim(),
          value: line.slice(colon + 1).trim(),
        }
      } else {
        current = null
      }
    }
  }
  if (current) headers.push(current)

  // Categorize and detect pass/fail status
  const AUTH_HEADERS = new Set([
    "authentication-results",
    "dkim-signature",
    "arc-authentication-results",
    "arc-message-signature",
    "arc-seal",
    "received-spf",
    "x-google-dkim-signature",
  ])

  const ROUTING_HEADERS = new Set([
    "received",
    "x-forwarded-to",
    "x-original-to",
    "delivered-to",
    "x-received",
    "return-path",
  ])

  const IDENTITY_HEADERS = new Set([
    "from",
    "to",
    "reply-to",
    "sender",
    "message-id",
    "date",
    "subject",
    "mime-version",
    "content-type",
    "list-unsubscribe",
    "list-unsubscribe-post",
    "feedback-id",
    "x-mailer",
    "x-campaign-id",
    "x-campaign",
  ])

  // Redact recipient fields to protect seed email addresses
  const REDACTED_FIELDS = new Set(["to", "delivered-to", "x-original-to", "x-forwarded-to"])

  return headers.map(({ name, value }) => {
    if (REDACTED_FIELDS.has(name.toLowerCase())) {
      return { name, value: "[redacted]", category: "identity" as const, status: undefined }
    }
    const nameLower = name.toLowerCase()
    let category: ParsedHeader["category"] = "other"
    let status: ParsedHeader["status"] | undefined

    if (AUTH_HEADERS.has(nameLower)) {
      category = "auth"
      // Detect pass/fail from value text
      const valueLower = value.toLowerCase()
      if (valueLower.includes("pass") || valueLower.includes("=pass")) status = "pass"
      else if (
        valueLower.includes("fail") ||
        valueLower.includes("=fail") ||
        valueLower.includes("hardfail") ||
        valueLower.includes("softfail")
      )
        status = "fail"
      else status = "neutral"
    } else if (ROUTING_HEADERS.has(nameLower)) {
      category = "routing"
    } else if (IDENTITY_HEADERS.has(nameLower)) {
      category = "identity"
    }

    return { name, value, category, status }
  })
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const campaignId = params.id
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const clientId: string | undefined = user.clientId as string | undefined
    if (!clientId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    // Check plan — must be "all" (Professional), "enterprise", or super_admin / rip
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { subscriptionPlan: true, slug: true },
    })

    const hasAccess =
      client?.subscriptionPlan === "all" ||
      client?.subscriptionPlan === "enterprise" ||
      client?.slug === "rip" ||
      user.role === "super_admin"

    if (!hasAccess) {
      return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
    }

    const campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { id: campaignId },
      select: {
        rawHeaders: true,
        seenBySeedEmails: true,
      },
    })

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    if (!campaign.rawHeaders) {
      return NextResponse.json({ hasHeaders: false })
    }

    // Scrub all seed email local parts from the raw headers before parsing
    let scrubbed = campaign.rawHeaders
    const seedEmails = Array.isArray(campaign.seenBySeedEmails) ? (campaign.seenBySeedEmails as string[]) : []
    for (const addr of seedEmails) {
      const localPart = typeof addr === "string" ? addr.split("@")[0] : null
      if (localPart) {
        const escaped = localPart.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        scrubbed = scrubbed.replace(new RegExp(escaped, "gi"), "[redacted]")
      }
    }

    const parsed = parseRawHeaders(scrubbed)

    return NextResponse.json({ hasHeaders: true, parsed })
  } catch (error) {
    console.error("Error fetching campaign headers:", error)
    return NextResponse.json({ error: "Failed to fetch headers" }, { status: 500 })
  }
}
