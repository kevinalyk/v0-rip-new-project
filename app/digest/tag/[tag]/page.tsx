export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { cookies } from "next/headers"
import { format } from "date-fns"
import { notFound } from "next/navigation"
import { Newspaper, ArrowLeft } from "lucide-react"
import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import AdBanner from "@/components/ad-banner"
import { shouldShowAd } from "@/lib/ads"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

const ALL_TAGS = [
  "2026-elections",
  "senate",
  "house",
  "polling",
  "endorsements",
  "primaries",
  "dem-watch",
  "fundraising",
  "generic-ballot",
  "senate-battleground",
  "pennsylvania",
  "georgia",
  "arizona",
  "michigan",
  "wisconsin",
  "nevada",
  "north-carolina",
  "texas",
  "ohio",
  "florida",
]

const STATE_TAGS = new Set([
  "pennsylvania",
  "georgia",
  "arizona",
  "michigan",
  "wisconsin",
  "nevada",
  "north-carolina",
  "texas",
  "ohio",
  "florida",
])

function tagLabel(tag: string): string {
  return tag
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

interface Props {
  params: { tag: string }
}

export async function generateStaticParams() {
  return ALL_TAGS.map((tag) => ({ tag }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tag = params.tag
  const label = tagLabel(tag)
  const url = `${BASE_URL}/digest/tag/${tag}`

  let title: string
  let description: string

  if (STATE_TAGS.has(tag)) {
    title = `${label} Senate 2026 News & Polls | GOP Digest | Inbox.GOP`
    description = `Latest Republican political intelligence for ${label} — polling, endorsements, primary results, and 2026 Senate race updates. Published daily by Inbox.GOP.`
  } else {
    title = `GOP ${label} Tracker 2026 | Intelligence Digest | Inbox.GOP`
    description = `All GOP Digest articles covering ${label} — Republican polling, primary results, and 2026 election intelligence from Inbox.GOP.`
  }

  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "Inbox.GOP",
      type: "website",
      images: [{ url: `${BASE_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: `Inbox.GOP — ${label}` }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${BASE_URL}/og-candidate-directory.png`],
    },
  }
}

const PAGE_SIZE = 20

export default async function DigestTagPage({ params }: Props) {
  const tag = params.tag

  if (!ALL_TAGS.includes(tag)) notFound()

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
    updatedAt: string
  }[] = []

  try {
    const rows = await prisma.digestArticle.findMany({
      where: {
        tags: { array_contains: tag },
      },
      orderBy: { publishedAt: "desc" },
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
    console.error("[DigestTagPage] failed to fetch articles:", err)
  }

  const label = tagLabel(tag)
  const tagUrl = `${BASE_URL}/digest/tag/${tag}`

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Intelligence Digest", item: `${BASE_URL}/digest` },
      { "@type": "ListItem", position: 2, name: label, item: tagUrl },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
        <AdBanner showAd={showAd} />
        <div className="container mx-auto py-8 px-4 max-w-3xl">
          {/* Back link */}
          <a
            href="/digest"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
            <ArrowLeft size={14} />
            Back to Intelligence Digest
          </a>

          <div className="flex items-center gap-3 mb-2">
            <Newspaper size={22} className="text-[#dc2a28]" />
            <h1 className="text-2xl font-bold tracking-tight">{label}</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-10">
            All digest articles tagged <span className="font-medium text-foreground">{tag}</span>
          </p>

          {articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
              <Newspaper size={40} className="text-muted-foreground/30" />
              <p className="text-muted-foreground">No articles found for this tag.</p>
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

                      <h2 className="text-lg font-bold leading-snug mb-2 text-balance">
                        <a
                          href={`/digest/${a.slug}`}
                          className="hover:text-[#dc2a28] transition-colors"
                        >
                          {a.title}
                        </a>
                      </h2>

                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-3">
                        {excerpt}
                      </p>

                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {tags.map((t) => (
                            <a
                              key={t}
                              href={`/digest/tag/${t}`}
                              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors ${
                                t === tag
                                  ? "bg-[#dc2a28]/10 text-[#dc2a28] border-[#dc2a28]/40"
                                  : "bg-muted text-muted-foreground border-border hover:border-[#dc2a28]/40 hover:text-foreground"
                              }`}
                            >
                              {t}
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
        </div>
      </AppLayout>
    </>
  )
}
