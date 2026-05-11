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
    const now = new Date()
    const etParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now)
    const etYear = Number(etParts.find((p) => p.type === "year")!.value)
    const etMonth = Number(etParts.find((p) => p.type === "month")!.value) - 1
    const etDay = Number(etParts.find((p) => p.type === "day")!.value)

    // Determine ET UTC offset at today's midnight
    const todayMidnightET = new Date(`${etYear}-${String(etMonth + 1).padStart(2, "0")}-${String(etDay).padStart(2, "0")}T00:00:00`)
    const etOffset = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset",
    }).formatToParts(todayMidnightET).find((p) => p.type === "timeZoneName")!.value
    const etOffsetHours = -Number(etOffset.replace("GMT", "").replace("+", ""))
    const etOffsetMs = etOffsetHours * 60 * 60 * 1000

    // Today midnight ET in UTC, then offset by dateOffset
    const todayMidnightUTC = new Date(Date.UTC(etYear, etMonth, etDay, 0, 0, 0) + etOffsetMs)
    const windowEnd = new Date(todayMidnightUTC.getTime() - (dateOffset - 1) * 24 * 60 * 60 * 1000)
    const windowStart = new Date(todayMidnightUTC.getTime() - dateOffset * 24 * 60 * 60 * 1000)

    const digestDateLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    }).format(windowStart)

    // ── Fetch all non-free clients ───────────────────────────────────────────
    const clients = await prisma.client.findMany({
      where: { subscriptionPlan: { not: "free" } },
      select: { id: true, slug: true },
    })

    if (clients.length === 0) {
      return NextResponse.json({ ok: true, message: "No paid clients", sent: 0, failed: 0, results: [] })
    }

    let totalSent = 0
    const results: Array<{ client: string; sent: number; failed: number; error?: string }> = []

    for (const client of clients) {
      try {
        // ── Entity subscriptions ──────────────────────────────────────────────
        const subscriptions = await prisma.ciEntitySubscription.findMany({
          where: { clientId: client.id },
          select: {
            entityId: true,
            entity: { select: { id: true, name: true, party: true, state: true } },
          },
        })

        if (subscriptions.length === 0) {
          results.push({ client: client.slug, sent: 0, failed: 0 })
          continue
        }

        const entityIds = subscriptions.map((s) => s.entityId)

        // ── Emails ────────────────────────────────────────────────────────────
        const emails = await prisma.competitiveInsightCampaign.findMany({
          where: {
            entityId: { in: entityIds },
            dateReceived: { gte: windowStart, lt: windowEnd },
            isHidden: false,
            isDeleted: false,
          },
          select: { id: true, entityId: true, subject: true, senderEmail: true, dateReceived: true, shareToken: true },
          orderBy: { dateReceived: "desc" },
        })

        // ── SMS ───────────────────────────────────────────────────────────────
        const smsMessages = await prisma.smsQueue.findMany({
          where: {
            entityId: { in: entityIds },
            createdAt: { gte: windowStart, lt: windowEnd },
            isHidden: false,
            isDeleted: false,
          },
          select: { id: true, entityId: true, message: true, phoneNumber: true, createdAt: true, shareToken: true },
          orderBy: { createdAt: "desc" },
        })

        // ── Ensure share tokens ───────────────────────────────────────────────
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

        // ── Build entity sections ─────────────────────────────────────────────
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

        // ── Fetch users and send ──────────────────────────────────────────────
        const users = await prisma.user.findMany({
          where: {
            clientId: client.id,
            digestEnabled: true,
            ...(emailOverride ? { email: emailOverride } : {}),
          },
          select: { email: true, firstName: true },
        })

        let sent = 0
        let failed = 0

        for (const user of users) {
          if (!user.email) continue
          const ok = await sendFollowingDigest({
            to: user.email,
            firstName: user.firstName,
            digestDate: digestDateLabel,
            entitySections,
            clientSlug: client.slug,
          })
          if (ok) sent++
          else failed++
          if (emailOverride) break
        }

        totalSent += sent
        results.push({ client: client.slug, sent, failed })
      } catch (err: any) {
        console.error(`[trigger-digest] ${client.slug} error:`, err.message)
        results.push({ client: client.slug, sent: 0, failed: 0, error: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString(), label: digestDateLabel },
      totalSent,
      results,
    })
  } catch (err) {
    console.error("[trigger-digest]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
