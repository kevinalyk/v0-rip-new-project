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
  ]

  // Dynamic directory profile pages
  try {
    const entities = await prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      select: { name: true, updatedAt: true },
      orderBy: { name: "asc" },
    })

    const entityPages: MetadataRoute.Sitemap = entities.map((entity) => ({
      url: `${APP_URL}/directory/${nameToSlug(entity.name)}`,
      lastModified: entity.updatedAt ?? new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }))

    return [...staticPages, ...entityPages]
  } catch {
    // If DB is unavailable during build, return just static pages
    return staticPages
  }
}
