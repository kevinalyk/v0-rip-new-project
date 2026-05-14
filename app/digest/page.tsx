export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { cookies } from "next/headers"
import { format } from "date-fns"
import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import DigestPageClient from "@/components/digest-page-client"
import { Newspaper } from "lucide-react"
import AdBanner from "@/components/ad-banner"
import { shouldShowAd } from "@/lib/ads"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export const metadata: Metadata = {
  title: "Intelligence Digest - Inbox.GOP",
  description: "Political intelligence and analysis from the Inbox.GOP team.",
  openGraph: {
    title: "Intelligence Digest - Inbox.GOP",
    description: "Political intelligence and analysis from the Inbox.GOP team.",
    url: `${BASE_URL}/digest`,
    siteName: "Inbox.GOP",
    type: "website",
  },
}

export default async function DigestPage() {
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

  let articles: {
    id: string
    slug: string
    title: string
    summary: string | null
    body: string
    imageUrl: string | null
    tags: string[] | null
    publishedAt: string
    createdBy: string
    updatedAt: string
  }[] = []

  try {
    const rows = await prisma.digestArticle.findMany({
      orderBy: { publishedAt: "desc" },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        body: true,
        imageUrl: true,
        tags: true,
        publishedAt: true,
        createdBy: true,
        updatedAt: true,
      },
    })
    articles = rows.map((r) => ({
      ...r,
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : null,
      publishedAt: r.publishedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  } catch (err) {
    console.error("[DigestPage] failed to pre-fetch articles:", err)
  }

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <AdBanner showAd={showAd} />
      <div className="container mx-auto py-8 px-4 max-w-3xl">
        <div className="flex items-center justify-between mb-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Newspaper size={22} className="text-[#dc2a28]" />
              <h1 className="text-2xl font-bold tracking-tight">Intelligence Digest</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Political intelligence and analysis
            </p>
          </div>
        </div>

        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <Newspaper size={40} className="text-muted-foreground/30" />
            <p className="text-muted-foreground">No articles yet.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {articles.map((a) => {
              const excerpt =
                a.summary ||
                a.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200)
              const tags = a.tags ?? []
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
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <time
                        dateTime={new Date(a.publishedAt).toISOString()}
                        className="text-xs text-muted-foreground uppercase tracking-wide"
                      >
                        {format(new Date(a.publishedAt), "MMMM d, yyyy")}
                      </time>
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <h2 className="text-lg font-bold leading-snug mb-2 text-balance">
                      <a
                        href={`/digest/${a.slug}`}
                        className="hover:underline hover:text-[#dc2a28] transition-colors"
                      >
                        {a.title}
                      </a>
                    </h2>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                      {excerpt}
                    </p>
                    <a
                      href={`/digest/${a.slug}`}
                      aria-label={`Continue reading ${a.title}`}
                      className="inline-flex items-center gap-2 bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Continue Reading
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                    </a>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* Super-admin FAB + CRUD dialogs */}
      <DigestPageClient initialArticles={articles} />
    </AppLayout>
  )
}
