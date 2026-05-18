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
  const lines = raw.split(/\r?\n/)
  const headers: { name: string; value: string }[] = []
  let current: { name: string; value: string } | null = null

  for (const line of lines) {
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

  return headers.map(({ name, value }) => {
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
      select: { rawHeaders: true, assignmentMethod: true },
    })

    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
    }

    // SMS campaigns use assignmentMethod starting with "auto_" and won't have rawHeaders anyway
    if (!campaign.rawHeaders) {
      return NextResponse.json({ hasHeaders: false })
    }

    const parsed = parseRawHeaders(campaign.rawHeaders)

    return NextResponse.json({ hasHeaders: true, raw: campaign.rawHeaders, parsed })
  } catch (error) {
    console.error("Error fetching campaign headers:", error)
    return NextResponse.json({ error: "Failed to fetch headers" }, { status: 500 })
  }
}
