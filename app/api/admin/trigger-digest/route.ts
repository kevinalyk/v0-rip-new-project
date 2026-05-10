import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { nanoid } from "nanoid"
import { sendFollowingDigest, type DigestEntitySection, type DigestMessage } from "@/lib/mailgun"
import { nameToSlug } from "@/lib/directory-utils"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

/**
 * POST /api/admin/trigger-digest
 *
 * Manually fires the following digest — identical logic to the cron job.
 *
 * Body (JSON):
 *   email?      — send only to this address instead of all RIP users
 *   dateOffset? — how many days back to look (default 1 = yesterday)
 *
 * Requires: super_admin
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden — super_admin only" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { email: emailOverride, dateOffset = 1 } = body as {
      email?: string
      dateOffset?: number
    }

    // ── Date window (same as cron) ───────────────────────────────────────────
    const nowET = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
    )

    const windowStartET = new Date(nowET)
    windowStartET.setDate(windowStartET.getDate() - dateOffset)
    windowStartET.setHours(0, 0, 0, 0)

    const windowEndET = new Date(nowET)
    windowEndET.setDate(windowEndET.getDate() - (dateOffset - 1))
    windowEndET.setHours(0, 0, 0, 0)

    const etOffsetMs = nowET.getTime() - new Date().getTime()
    const windowStart = new Date(windowStartET.getTime() - etOffsetMs)
    const windowEnd = new Date(windowEndET.getTime() - etOffsetMs)

    const digestDateLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    }).format(nowET)

    // ── RIP client ───────────────────────────────────────────────────────────
    const ripClient = await prisma.client.findFirst({
      where: { slug: "rip" },
      select: { id: true, slug: true, subscriptionPlan: true },
    })
    if (!ripClient) {
      return NextResponse.json({ error: "RIP client not found" }, { status: 404 })
    }

    // ── Skip if client is on free plan ────────────────────────────────────────
    if (ripClient.subscriptionPlan === "free") {
      return NextResponse.json({ ok: true, message: "Free plan — no digest", sent: 0, failed: 0, results: [] })
    }

    // ── Entity subscriptions (same as cron) ──────────────────────────────────
    const subscriptions = await prisma.ciEntitySubscription.findMany({
      where: { clientId: ripClient.id },
      select: {
        entityId: true,
        entity: {
          select: {
            id: true,
            name: true,
            party: true,
            state: true,
          },
        },
      },
    })

    // ── Skip if no subscriptions ──────────────────────────────────────────────
    if (subscriptions.length === 0) {
      return NextResponse.json({ ok: true, message: "No subscriptions — no digest", sent: 0, failed: 0, results: [] })
    }

    const entityIds = subscriptions.map((s) => s.entityId)

    // ── Emails (same as cron) ────────────────────────────────────────────────
    const emails = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: { in: entityIds },
        dateReceived: { gte: windowStart, lt: windowEnd },
        isHidden: false,
        isDeleted: false,
      },
      select: {
        id: true,
        entityId: true,
        subject: true,
        senderEmail: true,
        dateReceived: true,
        shareToken: true,
      },
      orderBy: { dateReceived: "desc" },
    })

    // ── SMS (same as cron) ───────────────────────────────────────────────────
    const smsMessages = await prisma.smsQueue.findMany({
      where: {
        entityId: { in: entityIds },
        createdAt: { gte: windowStart, lt: windowEnd },
        isHidden: false,
        isDeleted: false,
      },
      select: {
        id: true,
        entityId: true,
        message: true,
        phoneNumber: true,
        createdAt: true,
        shareToken: true,
      },
      orderBy: { createdAt: "desc" },
    })

    // ── Ensure share tokens ──────────────────────────────────────────────────
    const ensureEmailToken = async (id: string, existing: string | null): Promise<string> => {
      if (existing) return existing
      const token = nanoid(16)
      await prisma.competitiveInsightCampaign.update({ where: { id }, data: { shareToken: token, shareTokenCreatedAt: new Date() } })
      return token
    }
    const ensureSmsToken = async (id: string, existing: string | null): Promise<string> => {
      if (existing) return existing
      const token = nanoid(16)
      await prisma.smsQueue.update({ where: { id }, data: { shareToken: token, shareTokenCreatedAt: new Date() } })
      return token
    }

    const emailTokenMap: Record<string, string> = {}
    for (const e of emails) emailTokenMap[e.id] = await ensureEmailToken(e.id, e.shareToken)

    const smsTokenMap: Record<string, string> = {}
    for (const s of smsMessages) smsTokenMap[s.id] = await ensureSmsToken(s.id, s.shareToken)

    // ── Build entity sections (same as cron) ─────────────────────────────────
    const entitySections: DigestEntitySection[] = subscriptions.map((sub) => {
      const entity = sub.entity

      const entityEmails: DigestMessage[] = emails
        .filter((e) => e.entityId === entity.id)
        .map((e) => ({
          kind: "email" as const,
          subject: e.subject,
          senderIdentifier: e.senderEmail,
          receivedAt: e.dateReceived,
          shareUrl: `${APP_URL}/share/${emailTokenMap[e.id]}`,
        }))

      const entitySms: DigestMessage[] = smsMessages
        .filter((s) => s.entityId === entity.id)
        .map((s) => ({
          kind: "sms" as const,
          subject: (s.message || "").slice(0, 80) + ((s.message || "").length > 80 ? "…" : ""),
          senderIdentifier: s.phoneNumber || "Unknown number",
          receivedAt: s.createdAt,
          shareUrl: `${APP_URL}/share/${smsTokenMap[s.id]}`,
        }))

      const merged = [...entityEmails, ...entitySms]
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
        .slice(0, 10)

      return {
        entityName: entity.name,
        entitySlug: nameToSlug(entity.name),
        party: entity.party,
        state: entity.state,
        messages: merged,
      }
    })

    entitySections.sort((a, b) => {
      if (b.messages.length !== a.messages.length) return b.messages.length - a.messages.length
      return a.entityName.localeCompare(b.entityName)
    })

    // ── Fetch users who have the digest enabled and send ────────────────────
    // When an emailOverride is provided, still filter by that specific user's digestEnabled.
    const users = await prisma.user.findMany({
      where: {
        clientId: ripClient.id,
        digestEnabled: true,
        ...(emailOverride ? { email: emailOverride } : {}),
      },
      select: { email: true, firstName: true },
    })

    const results: { email: string; sent: boolean; entityCount: number; messageCount: number }[] = []

    for (const user of users) {
      if (!user.email) continue

      const toAddress = emailOverride ?? user.email
      const totalMessages = entitySections.reduce((s, e) => s + e.messages.length, 0)

      const ok = await sendFollowingDigest({
        to: toAddress,
        firstName: user.firstName,
        digestDate: digestDateLabel,
        entitySections,
        clientSlug: ripClient.slug,
      })

      results.push({ email: toAddress, sent: ok, entityCount: subscriptions.length, messageCount: totalMessages })

      // If sending to a specific override address, only send once (not once per user)
      if (emailOverride) break
    }

    const sentCount = results.filter((r) => r.sent).length
    return NextResponse.json({
      ok: true,
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString(), label: digestDateLabel },
      sent: sentCount,
      failed: results.length - sentCount,
      results,
    })
  } catch (err) {
    console.error("[trigger-digest]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
