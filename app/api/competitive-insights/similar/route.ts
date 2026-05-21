import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { normalizeSubject } from "@/lib/campaign-detector"
import { parseFingerprint, jaccardSimilarity, SIMILARITY_THRESHOLD, SMS_SIMILARITY_THRESHOLD } from "@/lib/body-fingerprint"
import { nanoid } from "nanoid"

/** Ensure a row has a shareToken, generating and persisting one if missing. */
async function ensureShareToken(id: string, existing: string | null, table: "email" | "sms" = "email"): Promise<string> {
  if (existing) return existing
  const token = nanoid(16)
  if (table === "sms") {
    await prisma.smsQueue.update({
      where: { id },
      data: { shareToken: token, shareTokenCreatedAt: new Date() },
    })
  } else {
    await prisma.competitiveInsightCampaign.update({
      where: { id },
      data: { shareToken: token, shareTokenCreatedAt: new Date() },
    })
  }
  return token
}

const toDay = (d: Date | string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : "unknown"

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
    const type = request.nextUrl.searchParams.get("type") // "subject" | "body" | "sms-body"

    if (!id || !type) {
      return NextResponse.json({ error: "Missing id or type" }, { status: 400 })
    }

    // ── Subject match ────────────────────────────────────────────────────────
    if (type === "subject") {
      const source = await prisma.competitiveInsightCampaign.findUnique({
        where: { id },
        select: { id: true, subject: true, dateReceived: true, entityId: true },
      })
      if (!source) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

      const normalizedKey = normalizeSubject(source.subject || "")

      const all = await prisma.competitiveInsightCampaign.findMany({
        where: source.entityId ? { entityId: source.entityId } : {},
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

      const seenDays = new Set<string>()
      const matches = []
      for (const row of all) {
        if (normalizeSubject(row.subject || "") !== normalizedKey) continue
        if (row.id === id) continue
        const day = toDay(row.dateReceived)
        if (seenDays.has(day)) continue
        seenDays.add(day)
        const shareToken = await ensureShareToken(row.id, row.shareToken)
        matches.push({ ...row, shareToken })
      }

      return NextResponse.json({ matches, sourceId: id })
    }

    // ── Email body match ─────────────────────────────────────────────────────
    if (type === "body") {
      const source = await prisma.competitiveInsightCampaign.findUnique({
        where: { id },
        select: { id: true, bodyFingerprint: true, dateReceived: true, entityId: true },
      })
      if (!source) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

      const sourceFp = parseFingerprint(source.bodyFingerprint)
      if (sourceFp.size === 0) return NextResponse.json({ matches: [], sourceId: id })

      const all = await prisma.competitiveInsightCampaign.findMany({
        where: {
          bodyFingerprint: { not: null },
          ...(source.entityId ? { entityId: source.entityId } : {}),
        },
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
        const fp = parseFingerprint(row.bodyFingerprint)
        if (jaccardSimilarity(sourceFp, fp) < SIMILARITY_THRESHOLD) continue
        const day = toDay(row.dateReceived)
        if (seenDays.has(day)) continue
        seenDays.add(day)
        const shareToken = await ensureShareToken(row.id, row.shareToken)
        const { bodyFingerprint: _fp, ...rest } = row
        matches.push({ ...rest, shareToken })
      }

      return NextResponse.json({ matches, sourceId: id })
    }

    // ── SMS body match ───────────────────────────────────────────────────────
    if (type === "sms-body") {
      const smsSource = await prisma.smsQueue.findUnique({
        where: { id },
        select: { id: true, bodyFingerprint: true, createdAt: true, entityId: true },
      })
      if (!smsSource) return NextResponse.json({ error: "SMS not found" }, { status: 404 })

      const sourceFp = parseFingerprint(smsSource.bodyFingerprint)
      if (sourceFp.size === 0) return NextResponse.json({ matches: [], sourceId: id })

      const allSms = await prisma.smsQueue.findMany({
        where: {
          isDeleted: false,
          bodyFingerprint: { not: null },
          ...(smsSource.entityId ? { entityId: smsSource.entityId } : {}),
        },
        select: {
          id: true,
          message: true,
          phoneNumber: true,
          createdAt: true,
          shareToken: true,
          bodyFingerprint: true,
          entity: { select: { name: true, party: true, type: true } },
        },
        orderBy: { createdAt: "desc" },
      })

      const seenDays = new Set<string>()
      const matches = []
      for (const row of allSms) {
        if (row.id === id) continue
        const fp = parseFingerprint(row.bodyFingerprint)
        if (jaccardSimilarity(sourceFp, fp) < SMS_SIMILARITY_THRESHOLD) continue
        const day = toDay(row.createdAt)
        if (seenDays.has(day)) continue
        seenDays.add(day)
        const shareToken = await ensureShareToken(row.id, row.shareToken, "sms")
        const { bodyFingerprint: _fp, ...rest } = row
        matches.push({
          ...rest,
          shareToken,
          subject: row.message?.substring(0, 100) || "SMS Message",
          senderName: row.phoneNumber || "Unknown",
          senderEmail: row.phoneNumber || "",
          dateReceived: row.createdAt.toISOString(),
        })
      }

      return NextResponse.json({ matches, sourceId: id })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (error) {
    console.error("[similar] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
