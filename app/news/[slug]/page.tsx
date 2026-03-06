export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import prisma from "@/lib/prisma"
import NewsPostClient from "./news-post-client"

interface Props {
  params: { slug: string }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

  try {
    const post = await prisma.announcement.findUnique({
      where: { slug: params.slug },
    })

    if (!post) {
      return { title: "Post Not Found | RIP Tool" }
    }

    const plainText = stripHtml(post.body)
    const description = plainText.slice(0, 160).trim()
    const url = `${baseUrl}/news/${post.slug}`
    const ogImageUrl = post.imageUrl ?? `${url}/opengraph-image`
    const publishedTime =
      post.publishedAt instanceof Date
        ? post.publishedAt.toISOString()
        : new Date(post.publishedAt).toISOString()

    return {
      title: `${post.title} | RIP Tool`,
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
    console.error("[generateMetadata] Failed for slug:", params.slug, err)
    return { title: "RIP Tool News" }
  }
}

export default function NewsPostPage({ params }: Props) {
  return <NewsPostClient slug={params.slug} />
}
