import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { nanoid } from "nanoid"
import { sendWeeklyDigest, type WeeklyDigestItem } from "@/lib/mailgun"
import { nameToSlug } from "@/lib/directory-utils"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

/**
 * Weekly Top-10 Digest — fires at 9 PM ET every Sunday (02:00 UTC Monday)
 * For each non-free client, sends the top 10 most-viewed ActBlue/WinRed
 * emails and SMS from the past week to all users with weeklyDigestEnabled.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ── Date window: last 7 days, midnight ET ────────────────────────────────
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

    const todayMidnightUTC = new Date(Date.UTC(etYear, etMonth, etDay, 0, 0, 0) + etOffsetMs)
    const windowEnd = todayMidnightUTC
    const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000)

    const formatWeekLabel = (date: Date) =>
      new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "America/New_York",
      }).format(date)

    const weekStartLabel = formatWeekLabel(windowStart)
    const weekEndLabel = formatWeekLabel(new Date(windowEnd.getTime() - 1))

    console.log(`[weekly-digest] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`)

    // ── Fetch all non-free clients ───────────────────────────────────────────
    const clients = await prisma.client.findMany({
      where: { subscriptionPlan: { not: "free" } },
      select: { id: true, slug: true },
    })

    if (clients.length === 0) {
      console.log("[weekly-digest] No paid clients found")
      return NextResponse.json({ success: true, message: "No paid clients", processed: 0 })
    }

    // ── Fetch all active entities and build top 10 (shared across all clients) ─
    const allEntities = await prisma.ciEntity.findMany({
      where: { isActive: true },
      select: { id: true, name: true, party: true, state: true },
    })
    const entityIds = allEntities.map((e) => e.id)
    const entityMap = Object.fromEntries(allEntities.map((e) => [e.id, e]))

    if (entityIds.length === 0) {
      return NextResponse.json({ success: true, message: "No active entities", processed: 0 })
    }

    // ── Fetch emails and SMS in window ───────────────────────────────────────
    const [emails, smsMessages] = await Promise.all([
      prisma.competitiveInsightCampaign.findMany({
        where: {
          entityId: { in: entityIds },
          dateReceived: { gte: windowStart, lt: windowEnd },
          isHidden: false,
          isDeleted: false,
          donationPlatform: { in: ["winred", "actblue"] },
        },
        select: { id: true, entityId: true, subject: true, senderEmail: true, dateReceived: true, viewCount: true, shareToken: true },
      }),
      prisma.smsQueue.findMany({
        where: {
          entityId: { in: entityIds },
          createdAt: { gte: windowStart, lt: windowEnd },
          isHidden: false,
          isDeleted: false,
          assignmentMethod: { in: ["auto_winred", "auto_actblue"] },
        },
        select: { id: true, entityId: true, message: true, phoneNumber: true, createdAt: true, viewCount: true, shareToken: true },
      }),
    ])

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

    // ── Build and sort top 10 ────────────────────────────────────────────────
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

    allItems.sort((a, b) => {
      if (b.viewCount !== a.viewCount) return b.viewCount - a.viewCount
      return a.subject.localeCompare(b.subject)
    })

    const top10 = allItems.slice(0, 10)

    if (top10.length === 0) {
      console.log("[weekly-digest] No content in window — skipping")
      return NextResponse.json({ success: true, message: "No content in window", processed: 0 })
    }

    // ── Send to all clients ──────────────────────────────────────────────────
    let totalSent = 0
    const results: Array<{ client: string; sent: number; failed: number; error?: string }> = []

    for (const client of clients) {
      try {
        const users = await prisma.user.findMany({
          where: { clientId: client.id, weeklyDigestEnabled: true },
          select: { email: true, firstName: true },
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
          })
          if (ok) {
            sent++
            console.log(`[weekly-digest] ${client.slug}: sent to ${user.email}`)
          } else {
            failed++
            console.error(`[weekly-digest] ${client.slug}: failed for ${user.email}`)
          }
        }

        totalSent += sent
        results.push({ client: client.slug, sent, failed })
      } catch (err: any) {
        console.error(`[weekly-digest] ${client.slug} error:`, err.message)
        results.push({ client: client.slug, sent: 0, failed: 0, error: err.message })
      }
    }

    console.log(`[weekly-digest] Done — ${totalSent} total sent`)
    return NextResponse.json({
      success: true,
      totalSent,
      itemCount: top10.length,
      results,
      window: { start: windowStart.toISOString(), end: windowEnd.toISOString() },
    })
  } catch (err) {
    console.error("[weekly-digest]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
