import type { MetadataRoute } from "next"
import prisma from "@/lib/prisma"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Static public pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${APP_URL}/directory`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${APP_URL}/news`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
  ]

  // Dynamic directory profile pages
  let entityPages: MetadataRoute.Sitemap = []
  try {
    const entities = await prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      select: { name: true, updatedAt: true },
      orderBy: { name: "asc" },
    })

    entityPages = entities.map((entity) => ({
      url: `${APP_URL}/directory/${nameToSlug(entity.name)}`,
      lastModified: entity.updatedAt ?? new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }))
  } catch {
    // If DB is unavailable during build, fall back to just static pages
  }

  // Dynamic news posts (only those that are actually published)
  let newsPages: MetadataRoute.Sitemap = []
  try {
    const now = new Date()
    const posts = await prisma.announcement.findMany({
      where: {
        publishedAt: { not: null, lte: now },
      },
      select: { slug: true, publishedAt: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    })

    newsPages = posts.map((post) => ({
      url: `${APP_URL}/news/${post.slug}`,
      lastModified: post.updatedAt ?? post.publishedAt ?? new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }))
  } catch {
    // If DB is unavailable during build, skip news pages
  }

  return [...staticPages, ...entityPages, ...newsPages]
}
