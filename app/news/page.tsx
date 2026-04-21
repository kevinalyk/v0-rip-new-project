export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import NewsPageClient from "@/components/news-page-client"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export const metadata: Metadata = {
  title: "What's New — Inbox.GOP",
  description: "Updates, improvements, and new features from the Inbox.GOP team.",
  openGraph: {
    title: "What's New — Inbox.GOP",
    description: "Updates, improvements, and new features from the Inbox.GOP team.",
    url: `${BASE_URL}/news`,
    siteName: "RIP Tool",
    type: "website",
  },
}

export default async function NewsPage() {
  // Resolve auth server-side so AppLayout renders with the correct clientSlug
  // in the initial HTML — no auth waterfall on the client.
  let clientSlug = ""
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (token) {
      const payload = await verifyToken(token)
      if (payload) clientSlug = (payload.clientSlug as string) || ""
    }
  } catch { /* unauthenticated visitor */ }

  // Pre-fetch published articles server-side so crawlers receive real content
  // in the initial HTML response rather than a loading spinner.
  let initialAnnouncements: {
    id: string
    slug: string
    title: string
    body: string
    imageUrl: string | null
    publishedAt: string
    createdBy: string
    updatedAt: string
  }[] = []

  try {
    const rows = await prisma.announcement.findMany({
      where: { publishedAt: { not: null } },
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        body: true,
        imageUrl: true,
        publishedAt: true,
        createdBy: true,
        updatedAt: true,
      },
    })

    initialAnnouncements = rows.map((r) => ({
      ...r,
      publishedAt: r.publishedAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  } catch (err) {
    console.error("[NewsPage] failed to pre-fetch announcements:", err)
  }

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <NewsPageClient initialAnnouncements={initialAnnouncements} />
    </AppLayout>
  )
}
