import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { nanoid } from "nanoid"
import { sendFollowingDigest, type DigestEntitySection, type DigestMessage } from "@/lib/mailgun"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

/**
 * POST /api/admin/trigger-digest
 *
 * Manually fires the following digest for a specific user or all RIP users.
 *
 * Body (JSON):
 *   userId?    — send only to this user (by ID). If omitted, sends to all rip users.
 *   email?     — override the to-address (useful for testing; still uses the target user's data)
 *   dateOffset? — how many days back to look (default 1 = yesterday, 0 = today so far)
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
    const { userId, email: emailOverride, dateOffset = 1 } = body as {
      userId?: string
      email?: string
      dateOffset?: number
    }

    // ── Date window ──────────────────────────────────────────────────────────
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
    }).format(windowStartET)

    // ── Fetch target users ───────────────────────────────────────────────────
    const ripClient = await prisma.client.findUnique({
      where: { slug: "rip" },
      select: { id: true, slug: true },
    })
    if (!ripClient) {
      return NextResponse.json({ error: "RIP client not found" }, { status: 404 })
    }

    const userWhere = userId
      ? { id: userId, clientId: ripClient.id }
      : { clientId: ripClient.id }

    const users = await prisma.user.findMany({
      where: {
        ...userWhere,
        email: { not: null },
        digestEnabled: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        followedEntities: {
          select: {
            entity: {
              select: {
                id: true,
                name: true,
                slug: true,
                party: true,
                state: true,
              },
            },
          },
        },
      },
    })

    if (users.length === 0) {
      return NextResponse.json({ error: "No eligible users found" }, { status: 404 })
    }

    const results: { email: string; sent: boolean; entityCount: number; messageCount: number }[] = []

    for (const user of users) {
      if (!user.email) continue

      const followedEntities = user.followedEntities.map((f) => f.entity)
      if (followedEntities.length === 0) {
        results.push({ email: emailOverride ?? user.email, sent: false, entityCount: 0, messageCount: 0 })
        continue
      }

      const entityIds = followedEntities.map((e) => e.id)

      const [campaigns, smsList] = await Promise.all([
        prisma.emailCampaign.findMany({
          where: {
            entityId: { in: entityIds },
            dateReceived: { gte: windowStart.toISOString(), lt: windowEnd.toISOString() },
          },
          select: {
            id: true,
            entityId: true,
            subject: true,
            senderEmail: true,
            dateReceived: true,
          },
          orderBy: { dateReceived: "desc" },
        }),
        prisma.sMSMessage.findMany({
          where: {
            entityId: { in: entityIds },
            createdAt: { gte: windowStart, lt: windowEnd },
          },
          select: {
            id: true,
            entityId: true,
            message: true,
            phoneNumber: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      ])

      const entitySections: DigestEntitySection[] = followedEntities.map((entity) => {
        const entityCampaigns = campaigns.filter((c) => c.entityId === entity.id)
        const entitySms = smsList.filter((s) => s.entityId === entity.id)

        const emailMessages: DigestMessage[] = entityCampaigns.map((c) => ({
          kind: "email",
          subject: c.subject || "(no subject)",
          senderIdentifier: c.senderEmail || "",
          receivedAt: new Date(c.dateReceived),
          shareUrl: `${APP_URL}/share/email/${nanoid(10)}`,
        }))

        const smsMessages: DigestMessage[] = entitySms.map((s) => ({
          kind: "sms",
          subject: s.message ? s.message.slice(0, 120) + (s.message.length > 120 ? "…" : "") : "(no preview)",
          senderIdentifier: s.phoneNumber || "",
          receivedAt: s.createdAt,
          shareUrl: `${APP_URL}/share/sms/${nanoid(10)}`,
        }))

        const merged = [...emailMessages, ...smsMessages].sort(
          (a, b) => b.receivedAt.getTime() - a.receivedAt.getTime(),
        )

        return {
          entityName: entity.name,
          entitySlug: entity.slug ?? null,
          party: entity.party,
          state: entity.state,
          messages: merged,
        }
      })

      const toAddress = emailOverride ?? user.email

      const ok = await sendFollowingDigest({
        to: toAddress,
        firstName: user.firstName,
        digestDate: digestDateLabel,
        entitySections,
        clientSlug: ripClient.slug,
      })

      const totalMessages = entitySections.reduce((s, e) => s + e.messages.length, 0)
      results.push({
        email: toAddress,
        sent: ok,
        entityCount: followedEntities.length,
        messageCount: totalMessages,
      })
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
