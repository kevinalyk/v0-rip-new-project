export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import prisma from "@/lib/prisma"
import NewsPostClient from "./news-post-client"

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const post = await prisma.announcement.findUnique({
      where: { slug: params.slug },
    })

    if (!post) {
      return { title: "Post Not Found | RIP Tool" }
    }

    const description = post.body.slice(0, 160).replace(/\s+/g, " ").trim()
    const url = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"}/news/${post.slug}`

    return {
      title: `${post.title} | RIP Tool`,
      description,
      openGraph: {
        title: post.title,
        description,
        url,
        type: "article",
        publishedTime: post.publishedAt.toISOString(),
        images: post.imageUrl
          ? [{ url: post.imageUrl, width: 1200, height: 630, alt: post.title }]
          : [{ url: `${url}/opengraph-image`, width: 1200, height: 630, alt: post.title }],
      },
      twitter: {
        card: "summary_large_image",
        title: post.title,
        description,
        images: post.imageUrl ? [post.imageUrl] : [`${url}/opengraph-image`],
      },
    }
  } catch {
    return { title: "RIP Tool" }
  }
}

export default function NewsPostPage({ params }: Props) {
  return <NewsPostClient slug={params.slug} />
}
