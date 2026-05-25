import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser() as any
    
    if (!user || user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "7")
    const excludeApi = searchParams.get("excludeApi") === "true"
    
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Deduplicated counts: one session per ip+user per hour
    const dedupedCounts = await prisma.$queryRaw`
      SELECT
        "isAuthenticated",
        COUNT(*) as count
      FROM (
        SELECT DISTINCT ON (
          ip,
          COALESCE("userId", ip),
          DATE_TRUNC('hour', "createdAt")
        )
          "isAuthenticated"
        FROM "SiteVisit"
        WHERE "createdAt" >= ${startDate}
        ORDER BY ip, COALESCE("userId", ip), DATE_TRUNC('hour', "createdAt"), "createdAt" DESC
      ) deduped
      GROUP BY "isAuthenticated"
    ` as Array<{ isAuthenticated: boolean; count: bigint }>

    const authenticatedVisits = Number(dedupedCounts.find(c => c.isAuthenticated)?.count || 0)
    const anonymousVisits = Number(dedupedCounts.find(c => !c.isAuthenticated)?.count || 0)
    const totalVisits = authenticatedVisits + anonymousVisits

    // Get unique IPs
    const uniqueIps = await prisma.siteVisit.groupBy({
      by: ["ip"],
      where: { createdAt: { gte: startDate } }
    })

    // Get unique authenticated users
    const uniqueUsers = await prisma.siteVisit.groupBy({
      by: ["userId"],
      where: { 
        createdAt: { gte: startDate },
        isAuthenticated: true,
        userId: { not: null }
      }
    })

    // Get visits by country
    const byCountry = await prisma.siteVisit.groupBy({
      by: ["country"],
      where: { 
        createdAt: { gte: startDate },
        country: { not: null }
      },
      _count: true,
      orderBy: { _count: { country: "desc" } },
      take: 10
    })

    // Get top anonymous IPs (potential leads or bots)
    const topAnonymousIps = await prisma.siteVisit.groupBy({
      by: ["ip", "country", "city"],
      where: { 
        createdAt: { gte: startDate },
        isAuthenticated: false
      },
      _count: true,
      orderBy: { _count: { ip: "desc" } },
      take: 15
    })

    // Get most active users
    const topUsers = await prisma.siteVisit.groupBy({
      by: ["userId", "userEmail"],
      where: { 
        createdAt: { gte: startDate },
        isAuthenticated: true,
        userId: { not: null }
      },
      _count: true,
      orderBy: { _count: { userId: "desc" } },
      take: 10
    })

    // Get visits per day for chart
    const visitsPerDay = await prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) FILTER (WHERE "isAuthenticated" = true) as authenticated,
        COUNT(*) FILTER (WHERE "isAuthenticated" = false) as anonymous
      FROM "SiteVisit"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    ` as Array<{ date: Date, authenticated: bigint, anonymous: bigint }>

    // Get recent visits - deduplicated: one row per unique ip+user combo per hour
    // For /share/ paths, LEFT JOIN to get the shareTokenSource from the appropriate table
    // When excludeApi is true, only include visits where the path is not an API call
    // and the referer resolves to a meaningful page
    type RawVisit = {
      id: string
      ip: string
      userAgent: string | null
      referer: string | null
      path: string
      statusCode: number | null
      userEmail: string | null
      isAuthenticated: boolean
      country: string | null
      city: string | null
      createdAt: Date
    }

    const recentVisitsRaw = excludeApi
      ? await prisma.$queryRaw<RawVisit[]>`
          SELECT id, ip, "userAgent", referer, path, "statusCode",
            "userEmail", "isAuthenticated", country, city, "createdAt"
          FROM "SiteVisit"
          WHERE "createdAt" >= ${startDate}
            AND (
              (path NOT LIKE '/api/%' AND path != '/login')
              OR
              (
                path LIKE '/api/%'
                AND referer IS NOT NULL
                AND referer NOT LIKE '%/login'
                AND referer NOT LIKE '%/login?%'
                AND length(referer) > 10
              )
            )
          ORDER BY "createdAt" DESC
          LIMIT 50
        `
      : await prisma.$queryRaw<RawVisit[]>`
          SELECT id, ip, "userAgent", referer, path, "statusCode",
            "userEmail", "isAuthenticated", country, city, "createdAt"
          FROM "SiteVisit"
          WHERE "createdAt" >= ${startDate}
          ORDER BY "createdAt" DESC
          LIMIT 50
        `

    const recentVisits = recentVisitsRaw

    // Share visits tab: dedicated query for /share/ paths with source lookup
    type ShareVisit = {
      id: string
      ip: string
      userAgent: string | null
      path: string
      statusCode: number | null
      userEmail: string | null
      country: string | null
      city: string | null
      createdAt: Date
      shareTokenSource: string | null
    }

    const shareVisitsRaw = await prisma.$queryRaw<ShareVisit[]>`
      SELECT id, ip, "userAgent", path, "statusCode",
        "userEmail", country, city, "createdAt", NULL::text AS "shareTokenSource"
      FROM "SiteVisit"
      WHERE "createdAt" >= ${startDate}
        AND path LIKE '/share/%'
      ORDER BY "createdAt" DESC
      LIMIT 200
    `

    // Look up shareTokenSource for each unique token
    const shareTokens = [...new Set(shareVisitsRaw.map(v => v.path.slice(7)))]

    const [emailSources, smsSources] = shareTokens.length > 0
      ? await Promise.all([
          prisma.competitiveInsightCampaign.findMany({
            where: { shareToken: { in: shareTokens } },
            select: { shareToken: true, shareTokenSource: true },
          }),
          prisma.smsQueue.findMany({
            where: { shareToken: { in: shareTokens } },
            select: { shareToken: true, shareTokenSource: true },
          }),
        ])
      : [[], []]

    const sourceMap = new Map<string, string | null>()
    for (const r of emailSources) if (r.shareToken) sourceMap.set(r.shareToken, r.shareTokenSource)
    for (const r of smsSources) if (r.shareToken) sourceMap.set(r.shareToken, r.shareTokenSource)

    const shareVisits: ShareVisit[] = shareVisitsRaw.map(v => ({
      ...v,
      shareTokenSource: sourceMap.get(v.path.slice(7)) ?? null,
    }))



    return NextResponse.json({
      summary: {
        totalVisits,
        authenticatedVisits,
        anonymousVisits,
        uniqueVisitors: uniqueIps.length,
        uniqueUsers: uniqueUsers.length,
        days
      },
      byCountry: byCountry.map(c => ({
        country: c.country || "Unknown",
        count: c._count
      })),
      topAnonymousIps: topAnonymousIps.map(t => ({
        ip: t.ip,
        country: t.country,
        city: t.city,
        count: t._count
      })),
      topUsers: topUsers.map(u => ({
        email: u.userEmail,
        count: u._count
      })),
      visitsPerDay: visitsPerDay.map(v => ({
        date: v.date,
        authenticated: Number(v.authenticated),
        anonymous: Number(v.anonymous)
      })),
      recentVisits,
      shareVisits
    })
  } catch (error) {
    console.error("Error fetching site traffic:", error)
    return NextResponse.json(
      { error: "Failed to fetch site traffic data" },
      { status: 500 }
    )
  }
}
