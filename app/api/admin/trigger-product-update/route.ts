import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { sendProductUpdateEmail, type ProductUpdateItem } from "@/lib/mailgun"

/**
 * POST /api/admin/trigger-product-update
 *
 * Manually fires the product update email.
 *
 * Body (JSON):
 *   email? — send only to this address instead of all users
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
    const { email: emailOverride } = body as { email?: string }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const announcements = await prisma.announcement.findMany({
      where: { publishedAt: { gte: since } },
      orderBy: { publishedAt: "desc" },
    })

    if (announcements.length === 0) {
      return NextResponse.json({ skipped: true, reason: "No announcements in the last 7 days", sent: 0, failed: 0, itemCount: 0 })
    }

    const items: ProductUpdateItem[] = announcements.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl,
      publishedAt: a.publishedAt,
    }))

    // If email override provided, send only to that address using the admin's own user record for tracking
    const adminUser = await prisma.user.findUnique({
      where: { id: authResult.user.id || authResult.user.userId },
      select: { id: true, firstName: true, client: { select: { slug: true } } },
    })

    let recipients: { id: string; email: string; firstName: string | null; clientSlug: string }[] = []

    if (emailOverride?.trim()) {
      recipients = [{
        id: adminUser?.id ?? "admin",
        email: emailOverride.trim(),
        firstName: adminUser?.firstName ?? null,
        clientSlug: adminUser?.client?.slug ?? "rip",
      }]
    } else {
      const users = await prisma.user.findMany({
        where: { productUpdateEnabled: true },
        select: {
          id: true,
          email: true,
          firstName: true,
          client: { select: { slug: true } },
        },
      })
      recipients = users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        clientSlug: u.client?.slug ?? "rip",
      }))
    }

    let sent = 0
    let failed = 0
    const results: { email: string; sent: boolean; itemCount: number }[] = []

    for (const user of recipients) {
      const success = await sendProductUpdateEmail({
        to: user.email,
        firstName: user.firstName,
        items,
        clientSlug: user.clientSlug,
        userId: user.id,
      })
      if (success) sent++
      else failed++
      results.push({ email: user.email, sent: success, itemCount: items.length })
    }

    return NextResponse.json({ sent, failed, itemCount: items.length, results })
  } catch (error) {
    console.error("Error triggering product update:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
