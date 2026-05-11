export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { cookies } from "next/headers"
import { format } from "date-fns"
import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import NewsPageClient from "@/components/news-page-client"
import { Megaphone } from "lucide-react"
import AdBanner from "@/components/ad-banner"
import { shouldShowAd } from "@/lib/ads"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export const metadata: Metadata = {
  title: "What's New - Inbox.GOP",
  description: "Updates, improvements, and new features from the Inbox.GOP team.",
  openGraph: {
    title: "What's New - Inbox.GOP",
    description: "Updates, improvements, and new features from the RIP Tool team — built for the Republican Inboxing Protocol.",
    url: `${BASE_URL}/news`,
    siteName: "RIP Tool",
    type: "website",
  },
}

export default async function NewsPage() {
  // Resolve auth server-side so AppLayout renders with the correct clientSlug.
  let clientSlug = ""
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (token) {
      const payload = await verifyToken(token)
      if (payload) clientSlug = (payload.clientSlug as string) || ""
    }
  } catch { /* unauthenticated visitor */ }

  const showAd = await shouldShowAd()

  // Fetch published articles server-side — these render as real HTML for crawlers.
  let announcements: {
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
    announcements = rows.map((r) => ({
      ...r,
      publishedAt: r.publishedAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  } catch (err) {
    console.error("[NewsPage] failed to pre-fetch announcements:", err)
  }

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <AdBanner showAd={showAd} />
      {/*
        Article cards are rendered as pure server HTML so crawlers see real
        content immediately. NewsPageClient mounts once below and handles
        admin-only controls (create/edit/delete dialogs) after hydration.
      */}
      <div className="container mx-auto py-8 px-4 max-w-3xl">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Megaphone size={22} className="text-[#dc2a28]" />
              <h1 className="text-2xl font-bold tracking-tight">{"What's New"}</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Updates, improvements, and new features from the RIP Tool team
            </p>
          </div>
        </div>

        {announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <Megaphone size={40} className="text-muted-foreground/30" />
            <p className="text-muted-foreground">No posts yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {announcements.map((a) => {
              const excerpt = a.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)
              return (
                <article
                  key={a.id}
                  className="rounded-xl border border-border bg-card overflow-hidden hover:border-[#dc2a28]/40 hover:shadow-md transition-all"
                >
                  {a.imageUrl && (
                    <div className="w-full aspect-[16/6] overflow-hidden bg-muted">
                      <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="px-5 py-4">
                    <time
                      dateTime={new Date(a.publishedAt).toISOString()}
                      className="text-xs text-muted-foreground mb-1.5 uppercase tracking-wide block"
                    >
                      {format(new Date(a.publishedAt), "MMMM d, yyyy")}
                    </time>
                    <h2 className="text-lg font-bold leading-snug mb-2 text-balance">
                      <a href={`/news/${a.slug}`} className="hover:underline hover:text-[#dc2a28] transition-colors">
                        {a.title}
                      </a>
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                      {excerpt}
                    </p>
                    <a
                      href={`/news/${a.slug}`}
                      aria-label={`Continue reading ${a.title}`}
                      className="inline-flex items-center gap-2 bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Continue Reading
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* Admin overlay — invisible to crawlers, hydrates after JS loads */}
      <NewsPageClient initialAnnouncements={announcements} />
    </AppLayout>
  )
}
