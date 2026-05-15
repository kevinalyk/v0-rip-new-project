export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { cookies } from "next/headers"
import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import DigestArticleClient from "./digest-article-client"
import AdBanner from "@/components/ad-banner"
import { shouldShowAd } from "@/lib/ads"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

interface Props {
  params: { slug: string }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const article = await prisma.digestArticle.findUnique({
      where: { slug: params.slug },
      select: { title: true, slug: true, summary: true, body: true, publishedAt: true, updatedAt: true, imageUrl: true, tags: true },
    })

    if (!article) return { title: "Article Not Found - Inbox.GOP" }

    const description = article.summary || stripHtml(article.body).slice(0, 160).trim()
    const url = `${BASE_URL}/digest/${article.slug}`
    const publishedTime = article.publishedAt.toISOString()
    // Always use the dynamic OG image route — it will layer the article imageUrl as a background if present
    const ogImageUrl = `${url}/opengraph-image`

    return {
      title: `${article.title} | Inbox.GOP`,
      description,
      robots: { index: true, follow: true },
      alternates: { canonical: url },
      openGraph: {
        title: article.title,
        description,
        url,
        siteName: "Inbox.GOP",
        type: "article",
        publishedTime,
        modifiedTime: article.updatedAt?.toISOString() ?? publishedTime,
        tags: Array.isArray(article.tags) ? (article.tags as string[]) : undefined,
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: article.title }],
      },
      twitter: {
        card: "summary_large_image",
        title: article.title,
        description,
        images: [ogImageUrl],
      },
    }
  } catch (err) {
    console.error("[DigestSlug] generateMetadata error:", err)
    return { title: "Intelligence Digest - Inbox.GOP" }
  }
}

export default async function DigestArticlePage({ params }: Props) {
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

  let initialArticle: {
    id: string
    slug: string
    title: string
    summary: string | null
    body: string
    imageUrl: string | null
    sources: { label: string; url: string }[] | null
    tags: string[] | null
    publishedAt: string
    createdBy: string
    updatedAt: string
  } | null = null

  try {
    const row = await prisma.digestArticle.findUnique({
      where: { slug: params.slug },
      select: {
        id: true,
        slug: true,
        title: true,
        summary: true,
        body: true,
        imageUrl: true,
        sources: true,
        tags: true,
        publishedAt: true,
        createdBy: true,
        updatedAt: true,
      },
    })

    if (row) {
      initialArticle = {
        ...row,
        sources: Array.isArray(row.sources) ? (row.sources as { label: string; url: string }[]) : null,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : null,
        publishedAt: row.publishedAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    }
  } catch (err) {
    console.error("[DigestArticlePage] failed to pre-fetch article:", err)
  }

  const articleUrl = initialArticle ? `${BASE_URL}/digest/${initialArticle.slug}` : null

  const articleJsonLd = initialArticle
    ? {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: initialArticle.title.slice(0, 110),
        description: initialArticle.summary || undefined,
        url: articleUrl,
        datePublished: initialArticle.publishedAt,
        dateModified: initialArticle.updatedAt,
        author: {
          "@type": "Organization",
          name: "Inbox.GOP Research Team",
          url: BASE_URL,
        },
        publisher: {
          "@type": "Organization",
          name: "Inbox.GOP",
          url: BASE_URL,
          logo: {
            "@type": "ImageObject",
            url: `${BASE_URL}/images/rip-wordmark.png`,
            width: 600,
            height: 60,
          },
        },
        image: {
          "@type": "ImageObject",
          url: initialArticle.imageUrl ?? `${BASE_URL}/og-candidate-directory.png`,
          width: 1200,
          height: 630,
        },
        articleSection: "Political Intelligence",
        ...(initialArticle.tags && initialArticle.tags.length > 0 && {
          keywords: initialArticle.tags.join(", "),
        }),
        isAccessibleForFree: true,
        isPartOf: {
          "@type": "Periodical",
          name: "Inbox.GOP Intelligence Digest",
          url: `${BASE_URL}/digest`,
        },
      }
    : null

  const breadcrumbJsonLd = initialArticle
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Intelligence Digest", item: `${BASE_URL}/digest` },
          { "@type": "ListItem", position: 2, name: initialArticle.title, item: articleUrl },
        ],
      }
    : null

  return (
    <>
      {articleJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
        />
      )}
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      )}
      <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
        <AdBanner showAd={showAd} />
        <DigestArticleClient slug={params.slug} initialArticle={initialArticle} />
      </AppLayout>
    </>
  )
}
