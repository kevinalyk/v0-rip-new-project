import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { nanoid } from "nanoid"
import { sendFollowingDigest, type DigestEntitySection, type DigestMessage } from "@/lib/mailgun"
import { nameToSlug } from "@/lib/directory-utils"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

/**
 * Daily Following Digest — fires at 7 AM ET (12:00 UTC)
 * For each RIP user, sends an email listing what their followed entities
 * sent the previous calendar day (midnight–midnight ET).
 *
 * TEST MODE: only sends to users whose client.slug === "rip"
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // ── Date window: yesterday midnight → today midnight ET ──────────────────
    const nowET = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/New_York" }),
    )
    const yesterdayStart = new Date(nowET)
    yesterdayStart.setDate(yesterdayStart.getDate() - 1)
    yesterdayStart.setHours(0, 0, 0, 0)

    const yesterdayEnd = new Date(nowET)
    yesterdayEnd.setHours(0, 0, 0, 0)

    // Convert back to UTC for DB queries
    const etOffsetMs = nowET.getTime() - new Date().getTime()
    const windowStart = new Date(yesterdayStart.getTime() - etOffsetMs)
    const windowEnd = new Date(yesterdayEnd.getTime() - etOffsetMs)

    const digestDateLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    }).format(yesterdayStart)

    console.log(`[digest-following] Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`)

    // ── Find RIP client and its subscriptions ─────────────────────────────────
    const ripClient = await prisma.client.findFirst({
      where: { slug: "rip" },
      select: { id: true, slug: true, subscriptionPlan: true },
    })

    if (!ripClient) {
      console.error("[digest-following] RIP client not found")
      return NextResponse.json({ error: "RIP client not found" }, { status: 404 })
    }

    // ── Skip if client is on free plan ────────────────────────────────────────
    if (ripClient.subscriptionPlan === "free") {
      console.log("[digest-following] RIP client is on free plan — skipping")
      return NextResponse.json({ success: true, message: "Free plan — no digest" })
    }

    // Get all entity subscriptions for RIP
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
      console.log("[digest-following] No entity subscriptions — skipping")
      return NextResponse.json({ success: true, message: "No subscriptions — no digest" })
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

    // ── Fetch all RIP users who have the digest enabled and send ─────────────
    const users = await prisma.user.findMany({
      where: { clientId: ripClient.id, digestEnabled: true },
      select: { email: true, firstName: true },
    })

    const stats = { sent: 0, failed: 0, skipped: 0 }

    for (const user of users) {
      if (!user.email) {
        stats.skipped++
        continue
      }

      const ok = await sendFollowingDigest({
        to: user.email,
        firstName: user.firstName,
        digestDate: digestDateLabel,
        entitySections,
        clientSlug: ripClient.slug,
      })

      if (ok) {
        stats.sent++
        console.log(`[digest-following] Sent to ${user.email}`)
      } else {
        stats.failed++
        console.error(`[digest-following] Failed to send to ${user.email}`)
      }
    }

    console.log(`[digest-following] Done — ${JSON.stringify(stats)}`)
    return NextResponse.json({ success: true, stats, digestDate: digestDateLabel })
  } catch (error: any) {
    console.error("[digest-following] Fatal error:", error.message)
    return NextResponse.json({ error: "Digest failed", message: error.message }, { status: 500 })
  }
}
