import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendProductUpdateEmail, type ProductUpdateItem } from "@/lib/mailgun"

/**
 * GET /api/cron/product-update
 *
 * Runs every Thursday at noon ET (17:00 UTC).
 * Sends a product update newsletter to all users who have productUpdateEnabled = true.
 * Only sends if there is at least one Announcement published in the last 7 days.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    const announcements = await prisma.announcement.findMany({
      where: { publishedAt: { gte: since } },
      orderBy: { publishedAt: "desc" },
    })

    if (announcements.length === 0) {
      return NextResponse.json({ skipped: true, reason: "No announcements in the last 7 days" })
    }

    const items: ProductUpdateItem[] = announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      imageUrl: a.imageUrl,
      publishedAt: a.publishedAt,
    }))

    const users = await prisma.user.findMany({
      where: { productUpdateEnabled: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        client: { select: { slug: true } },
      },
    })

    let sent = 0
    let failed = 0

    for (const user of users) {
      const clientSlug = user.client?.slug ?? "rip"
      const success = await sendProductUpdateEmail({
        to: user.email,
        firstName: user.firstName,
        items,
        clientSlug,
        userId: user.id,
      })
      if (success) sent++
      else failed++
    }

    return NextResponse.json({
      sent,
      failed,
      itemCount: items.length,
      userCount: users.length,
    })
  } catch (error) {
    console.error("Error running product-update cron:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
