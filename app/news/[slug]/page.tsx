export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import prisma from "@/lib/prisma"
import NewsPostClient from "./news-post-client"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

interface Props {
  params: { slug: string }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const post = await prisma.announcement.findUnique({
      where: { slug: params.slug },
      select: { title: true, slug: true, body: true, publishedAt: true, imageUrl: true },
    })

    if (!post) {
      return { title: "Post Not Found | RIP Tool" }
    }

    const plainText = stripHtml(post.body)
    const description = plainText.slice(0, 160).trim()
    const url = `${BASE_URL}/news/${post.slug}`
    const publishedTime = new Date(post.publishedAt!).toISOString()
    const ogImageUrl = post.imageUrl ?? `${url}/opengraph-image`

    return {
      title: `${post.title} — Inbox.GOP`,
      description,
      openGraph: {
        title: post.title,
        description,
        url,
        siteName: "RIP Tool",
        type: "article",
        publishedTime,
        images: [{ url: ogImageUrl, width: 1200, height: 630, alt: post.title }],
      },
      twitter: {
        card: "summary_large_image",
        title: post.title,
        description,
        images: [ogImageUrl],
      },
    }
  } catch (err) {
    console.error("[generateMetadata] error for slug:", params.slug, err)
    return { title: "RIP Tool News" }
  }
}

export default async function NewsPostPage({ params }: Props) {
  // Pre-fetch the post server-side so the full article body is present in the
  // initial HTML — crawlers and social scrapers read real content, not a spinner.
  let initialPost: {
    id: string
    slug: string
    title: string
    body: string
    imageUrl: string | null
    publishedAt: string
    createdBy: string
    updatedAt: string
  } | null = null

  try {
    const row = await prisma.announcement.findUnique({
      where: { slug: params.slug },
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

    if (row) {
      initialPost = {
        ...row,
        publishedAt: row.publishedAt?.toISOString() ?? new Date().toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      }
    }
  } catch (err) {
    console.error("[NewsPostPage] failed to pre-fetch post:", err)
  }

  return <NewsPostClient slug={params.slug} initialPost={initialPost} />
}
