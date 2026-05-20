import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { normalizeSubject } from "@/lib/campaign-detector"
import { parseFingerprint, jaccardSimilarity, SIMILARITY_THRESHOLD } from "@/lib/body-fingerprint"
import { nanoid } from "nanoid"

/** Ensure a campaign has a shareToken, generating and persisting one if missing. */
async function ensureShareToken(id: string, existing: string | null): Promise<string> {
  if (existing) return existing
  const token = nanoid(16)
  await prisma.competitiveInsightCampaign.update({
    where: { id },
    data: { shareToken: token, shareTokenCreatedAt: new Date() },
  })
  return token
}

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Must be pro/enterprise or super_admin
    const clientSlug = request.nextUrl.searchParams.get("clientSlug")
    let targetClientId = authResult.user.clientId!
    if (authResult.user.role === "super_admin" && clientSlug) {
      const targetClient = await prisma.client.findUnique({ where: { slug: clientSlug }, select: { id: true } })
      if (targetClient) targetClientId = targetClient.id
    }

    const client = await prisma.client.findUnique({
      where: { id: targetClientId },
      select: { subscriptionPlan: true },
    })
    const plan = client?.subscriptionPlan
    if (plan !== "all" && plan !== "enterprise" && authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const id = request.nextUrl.searchParams.get("id")
    const type = request.nextUrl.searchParams.get("type") // "subject" | "body"

    if (!id || !type) {
      return NextResponse.json({ error: "Missing id or type" }, { status: 400 })
    }

    // Fetch the source campaign
    const source = await prisma.competitiveInsightCampaign.findUnique({
      where: { id },
      select: { id: true, subject: true, bodyFingerprint: true, dateReceived: true },
    })
    if (!source) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

    const toDay = (d: Date | string | null) =>
      d ? new Date(d).toISOString().slice(0, 10) : "unknown"

    if (type === "subject") {
      const normalizedKey = normalizeSubject(source.subject || "")

      // Pull all campaigns with matching normalized subject
      const all = await prisma.competitiveInsightCampaign.findMany({
        select: {
          id: true,
          subject: true,
          senderName: true,
          senderEmail: true,
          dateReceived: true,
          shareToken: true,
          entity: { select: { name: true, party: true, type: true } },
        },
        orderBy: { dateReceived: "desc" },
      })

      // Deduplicate by day — keep the first (most recent) representative per day
      const seenDays = new Set<string>()
      const matches = []
      for (const row of all) {
        if (normalizeSubject(row.subject || "") !== normalizedKey) continue
        if (row.id === id) continue // exclude the source itself
        const day = toDay(row.dateReceived)
        if (seenDays.has(day)) continue
        seenDays.add(day)
        const shareToken = await ensureShareToken(row.id, row.shareToken)
        matches.push({ ...row, shareToken })
      }

      return NextResponse.json({ matches, sourceId: id })
    }

    if (type === "body") {
      const sourceFp = parseFingerprint(source.bodyFingerprint)
      if (sourceFp.size === 0) return NextResponse.json({ matches: [], sourceId: id })

      const all = await prisma.competitiveInsightCampaign.findMany({
        select: {
          id: true,
          subject: true,
          senderName: true,
          senderEmail: true,
          dateReceived: true,
          shareToken: true,
          bodyFingerprint: true,
          entity: { select: { name: true, party: true, type: true } },
        },
        orderBy: { dateReceived: "desc" },
      })

      const seenDays = new Set<string>()
      const matches = []
      for (const row of all) {
        if (row.id === id) continue
        if (!row.bodyFingerprint) continue
        const fp = parseFingerprint(row.bodyFingerprint)
        if (jaccardSimilarity(sourceFp, fp) < SIMILARITY_THRESHOLD) continue
        const day = toDay(row.dateReceived)
        if (seenDays.has(day)) continue
        seenDays.add(day)
        const shareToken = await ensureShareToken(row.id, row.shareToken)
        // Strip bodyFingerprint from response
        const { bodyFingerprint: _fp, ...rest } = row
        matches.push({ ...rest, shareToken })
      }

      return NextResponse.json({ matches, sourceId: id })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error) {
    console.error("[similar] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
