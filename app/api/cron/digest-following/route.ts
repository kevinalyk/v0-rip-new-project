import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { nanoid } from "nanoid"
import { sendFollowingDigest, type DigestEntitySection, type DigestMessage } from "@/lib/mailgun"
import { nameToSlug } from "@/lib/directory-utils"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

/**
 * Daily Following Digest — fires at 7 AM ET (12:00 UTC)
 * For each client, sends an email to their users listing what their followed entities
 * sent the previous calendar day (midnight–midnight ET).
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ── Date window: yesterday midnight → today midnight ET ──────────────────
    // Get today's date parts in ET using Intl, then build UTC timestamps
    // for midnight ET = UTC-4 (EDT) or UTC-5 (EST).
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

    // Determine ET UTC offset at today's midnight using a sentinel date
    const todayMidnightET = new Date(`${etYear}-${String(etMonth + 1).padStart(2, "0")}-${String(etDay).padStart(2, "0")}T00:00:00`)
    const etOffset = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      timeZoneName: "shortOffset",
    }).formatToParts(todayMidnightET).find((p) => p.type === "timeZoneName")!.value
    // e.g. "GMT-4" → -4, "GMT-5" → -5
    const etOffsetHours = -Number(etOffset.replace("GMT", "").replace("+", ""))
    const etOffsetMs = etOffsetHours * 60 * 60 * 1000

    // Today midnight ET in UTC
    const windowEnd = new Date(Date.UTC(etYear, etMonth, etDay, 0, 0, 0) + etOffsetMs)
    // Yesterday midnight ET in UTC
    const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000)

    // Label for the digest header — format windowStart (yesterday) in ET
    const digestDateLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    }).format(windowStart)

    console.log(`[digest-following] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`)

    // ── Fetch all non-free clients ───────────────────────────────────────────
    const clients = await prisma.client.findMany({
      where: { subscriptionPlan: { not: "free" } },
      select: { id: true, slug: true },
    })

    if (clients.length === 0) {
      console.log("[digest-following] No paid clients found")
      return NextResponse.json({ success: true, message: "No paid clients", processed: 0 })
    }

    let totalSent = 0
    const results: Array<{ client: string; sent: number; failed: number; error?: string }> = []

    // ── Process each client ──────────────────────────────────────────────────
    for (const client of clients) {
      try {
        // Get all entity subscriptions for this client
        const subscriptions = await prisma.ciEntitySubscription.findMany({
          where: { clientId: client.id },
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

        if (subscriptions.length === 0) {
          console.log(`[digest-following] Client ${client.slug}: no subscriptions`)
          results.push({ client: client.slug, sent: 0, failed: 0 })
          continue
        }

        const entityIds = subscriptions.map((s) => s.entityId)

        // ── Fetch yesterday's emails for subscribed entities ──────────────────────
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

        // ── Fetch yesterday's SMS for subscribed entities ─────────────────────────
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

        // ── Ensure share tokens exist for all messages (generate if missing) ──────
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

        // Build token maps (generate any missing tokens)
        const emailTokenMap: Record<string, string> = {}
        for (const e of emails) {
          emailTokenMap[e.id] = await ensureEmailToken(e.id, e.shareToken)
        }

        const smsTokenMap: Record<string, string> = {}
        for (const s of smsMessages) {
          smsTokenMap[s.id] = await ensureSmsToken(s.id, s.shareToken)
        }

        // ── Build per-entity sections ─────────────────────────────────────────────
        const entitySections: DigestEntitySection[] = subscriptions.map((sub) => {
          const entity = sub.entity

          // Collect emails for this entity
          const entityEmails: DigestMessage[] = emails
            .filter((e) => e.entityId === entity.id)
            .map((e) => ({
              kind: "email" as const,
              subject: e.subject,
              senderIdentifier: e.senderEmail,
              receivedAt: e.dateReceived,
              shareUrl: `${APP_URL}/share/${emailTokenMap[e.id]}`,
            }))

          // Collect SMS for this entity
          const entitySms: DigestMessage[] = smsMessages
            .filter((s) => s.entityId === entity.id)
            .map((s) => ({
              kind: "sms" as const,
              subject: (s.message || "").slice(0, 80) + ((s.message || "").length > 80 ? "…" : ""),
              senderIdentifier: s.phoneNumber || "Unknown number",
              receivedAt: s.createdAt,
              shareUrl: `${APP_URL}/share/${smsTokenMap[s.id]}`,
            }))

          // Merge and sort by date desc, cap at 10
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

        // Sort sections: entities with activity first, then alpha
        entitySections.sort((a, b) => {
          if (b.messages.length !== a.messages.length) return b.messages.length - a.messages.length
          return a.entityName.localeCompare(b.entityName)
        })

        // ── Fetch all users for this client who have the digest enabled and send ─
        const users = await prisma.user.findMany({
          where: { clientId: client.id, digestEnabled: true },
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

          if (ok) {
            sent++
            console.log(`[digest-following] ${client.slug}: sent to ${user.email}`)
          } else {
            failed++
            console.error(`[digest-following] ${client.slug}: failed to send to ${user.email}`)
          }
        }

        totalSent += sent
        results.push({ client: client.slug, sent, failed })
        console.log(`[digest-following] ${client.slug}: ${sent} sent, ${failed} failed`)
      } catch (err: any) {
        console.error(`[digest-following] ${client.slug} error:`, err.message)
        results.push({ client: client.slug, sent: 0, failed: 0, error: err.message })
      }
    }

    console.log(`[digest-following] Done — ${totalSent} total sent — ${JSON.stringify(results)}`)
    return NextResponse.json({ success: true, totalSent, results, digestDate: digestDateLabel })
  } catch (error: any) {
    console.error("[digest-following] Fatal error:", error.message)
    return NextResponse.json({ error: "Digest failed", message: error.message }, { status: 500 })
  }
}
