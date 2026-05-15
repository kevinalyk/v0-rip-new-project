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
const PAGE_SIZE = 30

interface Props {
  searchParams: { page?: string }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1)
  const canonical = page === 1 ? `${BASE_URL}/digest` : `${BASE_URL}/digest?page=${page}`

  const links: Metadata["alternates"] = {
    canonical,
  }

  return {
    title: "GOP Intelligence Digest | Daily Republican Political Analysis | Inbox.GOP",
    description:
      "Daily Republican political intelligence covering 2026 Senate battlegrounds, primaries, polling, endorsements, and Democratic failures. Published every weekday by Inbox.GOP.",
    keywords: [
      "republican intelligence digest",
      "GOP daily briefing",
      "political analysis",
      "senate battleground tracker",
      "republican primary news",
      "conservative political digest",
      "inbox gop digest",
      "daily political intelligence",
    ],
    robots: { index: true, follow: true },
    alternates: links,
    openGraph: {
      title: "GOP Intelligence Digest | Daily Republican Political Analysis | Inbox.GOP",
      description:
        "Daily Republican political intelligence covering 2026 Senate battlegrounds, primaries, polling, endorsements, and Democratic failures. Published every weekday by Inbox.GOP.",
      url: `${BASE_URL}/digest`,
      siteName: "Inbox.GOP",
      type: "website",
      images: [{ url: `${BASE_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: "Inbox.GOP Intelligence Digest" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "GOP Intelligence Digest | Inbox.GOP",
      description: "Daily Republican political intelligence and analysis from Inbox.GOP.",
      images: [`${BASE_URL}/og-candidate-directory.png`],
    },
  }
}

export default async function DigestPage({ searchParams }: Props) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1)
  const skip = (page - 1) * PAGE_SIZE

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

  let totalCount = 0

  try {
    const [rows, count] = await Promise.all([
      prisma.digestArticle.findMany({
        orderBy: { publishedAt: "desc" },
        skip,
        take: PAGE_SIZE,
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
      }),
      prisma.digestArticle.count(),
    ])
    totalCount = count
    articles = rows.map((r) => ({
      ...r,
      tags: Array.isArray(r.tags) ? (r.tags as string[]) : null,
      publishedAt: r.publishedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }))
  } catch (err) {
    console.error("[DigestPage] failed to pre-fetch articles:", err)
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasPrev = page > 1
  const hasNext = page < totalPages

  // ItemList JSON-LD — first 10 articles on this page
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "GOP Intelligence Digest",
    description: "Daily Republican political intelligence published by Inbox.GOP",
    url: `${BASE_URL}/digest`,
    itemListElement: articles.slice(0, 10).map((a, i) => ({
      "@type": "ListItem",
      position: skip + i + 1,
      url: `${BASE_URL}/digest/${a.slug}`,
      name: a.title,
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      {/* rel="prev" / rel="next" pagination signals for Google */}
      {hasPrev && (
        <link rel="prev" href={page === 2 ? `${BASE_URL}/digest` : `${BASE_URL}/digest?page=${page - 1}`} />
      )}
      {hasNext && (
        <link rel="next" href={`${BASE_URL}/digest?page=${page + 1}`} />
      )}

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
            <div className="space-y-4">
              {articles.map((a) => {
                const excerpt =
                  a.summary ||
                  a.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 150)
                const tags = (a.tags ?? []).slice(0, 6)
                return (
                  <article
                    key={a.id}
                    className="rounded-xl border border-border bg-card overflow-hidden hover:border-[#dc2a28]/40 hover:shadow-md transition-all"
                  >
                    {a.imageUrl && (
                      <div className="w-full aspect-[16/5] overflow-hidden bg-muted">
                        <img src={a.imageUrl} alt={a.title} className="w-full h-full object-cover" />
                      </div>
                    )}
                    <div className="px-5 pt-4 pb-5">
                      {/* Badge + date row */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-[10px] font-bold tracking-widest text-[#dc2a28] uppercase border border-[#dc2a28]/40 rounded px-2 py-0.5">
                          Daily Digest
                        </span>
                        <span className="text-muted-foreground text-xs">·</span>
                        <time
                          dateTime={new Date(a.publishedAt).toISOString()}
                          className="text-xs text-muted-foreground"
                        >
                          {format(new Date(a.publishedAt), "EEEE, MMMM d, yyyy")}
                        </time>
                      </div>

                      {/* Title */}
                      <h2 className="text-lg font-bold leading-snug mb-2 text-balance">
                        <a
                          href={`/digest/${a.slug}`}
                          className="hover:text-[#dc2a28] transition-colors"
                        >
                          {a.title}
                        </a>
                      </h2>

                      {/* Summary */}
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                        {excerpt}
                      </p>

                      {/* Tags + CTA row */}
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {tags.map((tag) => (
                            <a
                              key={tag}
                              href={`/digest/tag/${tag}`}
                              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border hover:border-[#dc2a28]/40 hover:text-foreground transition-colors"
                            >
                              {tag}
                            </a>
                          ))}
                        </div>
                        <a
                          href={`/digest/${a.slug}`}
                          aria-label={`Continue reading ${a.title}`}
                          className="inline-flex items-center gap-1.5 text-[#dc2a28] text-sm font-medium hover:underline transition-colors flex-shrink-0"
                        >
                          Read Digest
                          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                        </a>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
              <div>
                {hasPrev ? (
                  <a
                    href={page === 2 ? "/digest" : `/digest?page=${page - 1}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-[#dc2a28] transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
                    Newer
                  </a>
                ) : <span />}
              </div>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <div>
                {hasNext ? (
                  <a
                    href={`/digest?page=${page + 1}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-[#dc2a28] transition-colors"
                  >
                    Older
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                  </a>
                ) : <span />}
              </div>
            </div>
          )}
        </div>

        {/* Super-admin FAB + CRUD dialogs */}
        <DigestPageClient initialArticles={articles} />
      </AppLayout>
    </>
  )
}
