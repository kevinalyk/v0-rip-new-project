export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import NewsPostClient from "./news-post-client"

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

interface Props {
  params: { slug: string }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

async function getPost(slug: string) {
  try {
    const res = await fetch(`${BASE_URL}/api/announcements/by-slug/${slug}?public=1`, {
      cache: "no-store",
    })
    if (!res.ok) return null
    return res.json()
  } catch (err) {
    console.error("[generateMetadata] fetch failed for slug:", slug, err)
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost(params.slug)

  if (!post) {
    return { title: "Post Not Found | RIP Tool" }
  }

  const plainText = stripHtml(post.body)
  const description = plainText.slice(0, 160).trim()
  const url = `${BASE_URL}/news/${post.slug}`
  const publishedTime = new Date(post.publishedAt).toISOString()

  // Use the article's imageUrl if it's a public URL, otherwise fall back to the generated OG image
  const imageUrl = post.imageUrl && !post.imageUrl.includes("vercel-storage.com/blob/private")
    ? post.imageUrl
    : `${url}/opengraph-image`

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
      images: [{ url: imageUrl, width: 1200, height: 630, alt: post.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: [imageUrl],
    },
  }
}

export default function NewsPostPage({ params }: Props) {
  return <NewsPostClient slug={params.slug} />
}
