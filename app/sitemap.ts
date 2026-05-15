import type { MetadataRoute } from "next"
import prisma from "@/lib/prisma"
import {
  STATE_NAME_TO_ABBREV,
  STATE_ABBREV_TO_SLUG,
  PARTY_VALUE_TO_SLUG,
} from "@/lib/directory-routing"

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
      url: `${APP_URL}/lookup`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
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
    {
      url: `${APP_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${APP_URL}/privacy`,
      lastModified: new Date("2025-10-15"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${APP_URL}/terms`,
      lastModified: new Date("2025-10-15"),
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ]

  // Dynamic directory profile pages
  let entityPages: MetadataRoute.Sitemap = []
  // Landing pages (state, party, state+party) — only included if they have
  // at least one entity, so we don't ship empty pages to Google.
  let landingPages: MetadataRoute.Sitemap = []

  try {
    const entities = await prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      select: { name: true, state: true, party: true, updatedAt: true },
      orderBy: { name: "asc" },
    })

    entityPages = entities.map((entity) => ({
      url: `${APP_URL}/directory/${nameToSlug(entity.name)}`,
      lastModified: entity.updatedAt ?? new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }))

    // ─── Build landing-page URLs from real data ───
    // We tally (state, party) combinations from the entity rows so we only
    // emit URLs that will have actual content. Empty landing pages would hurt
    // SEO and waste Googlebot's crawl budget.
    const stateSet = new Set<string>()
    const partySet = new Set<string>()
    const comboSet = new Set<string>() // "stateSlug|partySlug" strings
    const lastModByLanding = new Map<string, Date>()

    const updateLandingMod = (key: string, date: Date | null) => {
      if (!date) return
      const existing = lastModByLanding.get(key)
      if (!existing || date > existing) lastModByLanding.set(key, date)
    }

    for (const entity of entities) {
      const stateAbbrev = entity.state ? STATE_NAME_TO_ABBREV[entity.state] ?? entity.state : null
      const stateSlug = stateAbbrev ? STATE_ABBREV_TO_SLUG[stateAbbrev] : null
      const partySlug = entity.party ? PARTY_VALUE_TO_SLUG[entity.party.toLowerCase()] : null
      const updatedAt = entity.updatedAt ?? new Date()

      if (stateSlug) {
        stateSet.add(stateSlug)
        updateLandingMod(`state:${stateSlug}`, updatedAt)
      }
      if (partySlug) {
        partySet.add(partySlug)
        updateLandingMod(`party:${partySlug}`, updatedAt)
      }
      if (stateSlug && partySlug) {
        const key = `${stateSlug}|${partySlug}`
        comboSet.add(key)
        updateLandingMod(`combo:${key}`, updatedAt)
      }
    }

    // Party landing pages
    for (const partySlug of partySet) {
      landingPages.push({
        url: `${APP_URL}/directory/${partySlug}`,
        lastModified: lastModByLanding.get(`party:${partySlug}`) ?? new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      })
    }
    // State landing pages
    for (const stateSlug of stateSet) {
      landingPages.push({
        url: `${APP_URL}/directory/${stateSlug}`,
        lastModified: lastModByLanding.get(`state:${stateSlug}`) ?? new Date(),
        changeFrequency: "weekly",
        priority: 0.7,
      })
    }
    // State + party combo landing pages
    for (const key of comboSet) {
      const [stateSlug, partySlug] = key.split("|")
      landingPages.push({
        url: `${APP_URL}/directory/${stateSlug}/${partySlug}`,
        lastModified: lastModByLanding.get(`combo:${key}`) ?? new Date(),
        changeFrequency: "weekly",
        priority: 0.6,
      })
    }
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

  // Dynamic digest articles
  let digestPages: MetadataRoute.Sitemap = []
  try {
    const articles = await prisma.digestArticle.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { publishedAt: "desc" },
    })

    digestPages = articles.map((article) => ({
      url: `${APP_URL}/digest/${article.slug}`,
      lastModified: article.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    }))
  } catch {
    // If DB is unavailable during build, skip digest pages
  }

  return [...staticPages, ...landingPages, ...entityPages, ...newsPages, ...digestPages]
}
