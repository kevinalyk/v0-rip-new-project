import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { nanoid } from "nanoid"
import { sendWeeklyDigest, type WeeklyDigestItem } from "@/lib/mailgun"
import { nameToSlug } from "@/lib/directory-utils"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

/**
 * POST /api/admin/trigger-weekly-digest
 *
 * Manually fires the weekly Top-10 digest.
 *
 * Body (JSON):
 *   email?      — send only to this address (respects weeklyDigestEnabled)
 *   weekOffset? — how many weeks back (default 1 = last week)
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
    const { email: emailOverride, weekOffset = 1 } = body as {
      email?: string
      weekOffset?: number
    }

    // ── Date window: last N weeks, midnight ET Sunday → midnight ET Sunday ────
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

    // Determine ET UTC offset
    const sentinelDate = new Date(
      `${etYear}-${String(etMonth + 1).padStart(2, "0")}-${String(etDay).padStart(2, "0")}T00:00:00`,
    )
    const etOffsetStr = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset",
    })
      .formatToParts(sentinelDate)
      .find((p) => p.type === "timeZoneName")!.value
    const etOffsetHours = -Number(etOffsetStr.replace("GMT", "").replace("+", ""))
    const etOffsetMs = etOffsetHours * 60 * 60 * 1000

    // Today midnight ET in UTC
    const todayMidnightUTC = new Date(Date.UTC(etYear, etMonth, etDay, 0, 0, 0) + etOffsetMs)

    // Window end = today midnight ET (offset by weekOffset - 1 full weeks back from today)
    // Window start = 7 days before window end
    const weekMs = 7 * 24 * 60 * 60 * 1000
    const windowEnd = new Date(todayMidnightUTC.getTime() - (weekOffset - 1) * weekMs)
    const windowStart = new Date(windowEnd.getTime() - weekMs)

    const formatWeekLabel = (date: Date) =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      }).format(date)

    const weekStartLabel = formatWeekLabel(windowStart)
    const weekEndLabel = formatWeekLabel(new Date(windowEnd.getTime() - 1)) // day before windowEnd

    // ── Fetch all clients (free and paid both get the weekly top 10) ─────────
    const clients = await prisma.client.findMany({
      select: { id: true, slug: true },
    })

    if (clients.length === 0) {
      return NextResponse.json({ ok: true, message: "No clients found", sent: 0, failed: 0, results: [] })
    }

    // ── Fetch all active entities on the platform ────────────────────────────
    const allEntities = await prisma.ciEntity.findMany({
      where: { isActive: true },
      select: { id: true, name: true, party: true, state: true },
    })
    const entityIds = allEntities.map((e) => e.id)
    const entityMap = Object.fromEntries(allEntities.map((e) => [e.id, e]))

    if (entityIds.length === 0) {
      return NextResponse.json({ ok: true, message: "No active entities — no digest", sent: 0, failed: 0, results: [] })
    }

    // ── Fetch emails in window ───────────────────────────────────────────────
    const emails = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: { in: entityIds },
        dateReceived: { gte: windowStart, lt: windowEnd },
        isHidden: false,
        isDeleted: false,
        donationPlatform: { in: ["winred", "actblue"] },
      },
      select: {
        id: true,
        entityId: true,
        subject: true,
        senderEmail: true,
        dateReceived: true,
        viewCount: true,
        shareToken: true,
      },
    })

    // ── Fetch SMS in window ──────────────────────────────────────────────────
    const smsMessages = await prisma.smsQueue.findMany({
      where: {
        entityId: { in: entityIds },
        createdAt: { gte: windowStart, lt: windowEnd },
        isHidden: false,
        isDeleted: false,
        assignmentMethod: { in: ["auto_winred", "auto_actblue"] },
      },
      select: {
        id: true,
        entityId: true,
        message: true,
        phoneNumber: true,
        createdAt: true,
        viewCount: true,
        shareToken: true,
      },
    })

    // ── Ensure share tokens ──────────────────────────────────────────────────
    const ensureEmailToken = async (id: string, existing: string | null): Promise<string> => {
      if (existing) return existing
      const token = nanoid(16)
      await prisma.competitiveInsightCampaign.update({
        where: { id },
        data: { shareToken: token, shareTokenCreatedAt: new Date() },
      })
      return token
    }
    const ensureSmsToken = async (id: string, existing: string | null): Promise<string> => {
      if (existing) return existing
      const token = nanoid(16)
      await prisma.smsQueue.update({
        where: { id },
        data: { shareToken: token, shareTokenCreatedAt: new Date() },
      })
      return token
    }

    const emailTokenMap: Record<string, string> = {}
    for (const e of emails) emailTokenMap[e.id] = await ensureEmailToken(e.id, e.shareToken)

    const smsTokenMap: Record<string, string> = {}
    for (const s of smsMessages) smsTokenMap[s.id] = await ensureSmsToken(s.id, s.shareToken)

    // ── Build combined item list, sort by viewCount desc, ties by subject asc ─
    const allItems: WeeklyDigestItem[] = [
      ...emails.map((e) => {
        const entity = entityMap[e.entityId]
        return {
          kind: "email" as const,
          subject: e.subject,
          entityName: entity?.name ?? "Unknown",
          entitySlug: entity ? nameToSlug(entity.name) : null,
          party: entity?.party ?? null,
          state: entity?.state ?? null,
          senderIdentifier: e.senderEmail,
          receivedAt: e.dateReceived,
          viewCount: e.viewCount,
          shareUrl: `${APP_URL}/share/${emailTokenMap[e.id]}`,
        }
      }),
      ...smsMessages.map((s) => {
        const entity = s.entityId ? entityMap[s.entityId] : null
        return {
          kind: "sms" as const,
          subject: (s.message || "").slice(0, 80) + ((s.message || "").length > 80 ? "…" : ""),
          entityName: entity?.name ?? "Unknown",
          entitySlug: entity ? nameToSlug(entity.name) : null,
          party: entity?.party ?? null,
          state: entity?.state ?? null,
          senderIdentifier: s.phoneNumber || "Unknown number",
          receivedAt: s.createdAt,
          viewCount: s.viewCount,
          shareUrl: `${APP_URL}/share/${smsTokenMap[s.id]}`,
        }
      }),
    ]

    // Sort: viewCount desc, then subject/message asc (alphabetical tie-break)
    allItems.sort((a, b) => {
      if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount
      return a.subject.localeCompare(b.subject)
    })

    const top10 = allItems.slice(0, 10)

    if (top10.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No content in window — no digest",
        sent: 0,
        failed: 0,
        results: [],
      })
    }

    // ── Send to all clients ──────────────────────────────────────────────────
    let totalSent = 0
    const results: Array<{ client: string; sent: number; failed: number; error?: string }> = []

    for (const client of clients) {
      try {
        const users = await prisma.user.findMany({
          where: {
            clientId: client.id,
            weeklyDigestEnabled: true,
            ...(emailOverride ? { email: emailOverride } : {}),
          },
          select: { id: true, email: true, firstName: true },
        })

        let sent = 0
        let failed = 0

        for (const user of users) {
          if (!user.email) continue
          const ok = await sendWeeklyDigest({
            to: user.email,
            firstName: user.firstName,
            weekStart: weekStartLabel,
            weekEnd: weekEndLabel,
            items: top10,
            clientSlug: client.slug,
            userId: user.id,
          })
          if (ok) sent++
          else failed++
          if (emailOverride) break
        }

        totalSent += sent
        results.push({ client: client.slug, sent, failed })
      } catch (err: any) {
        console.error(`[trigger-weekly-digest] ${client.slug} error:`, err.message)
        results.push({ client: client.slug, sent: 0, failed: 0, error: err.message })
      }
    }

    return NextResponse.json({
      ok: true,
      window: {
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
        label: `${weekStartLabel} – ${weekEndLabel}`,
      },
      itemCount: top10.length,
      totalSent,
      results,
    })
  } catch (err) {
    console.error("[trigger-weekly-digest]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
