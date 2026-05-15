import { NextResponse } from "next/server"
import { submitUrlForIndexing } from "@/lib/gsc"
import { prisma } from "@/lib/prisma"

// Called by Vercel Cron or manually — submits recently published digest articles to GSC for indexing
export async function GET(request: Request) {
  // Vercel Cron sends the CRON_SECRET as a Bearer token automatically
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error("[cron/gsc-index] Unauthorized request")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[cron/gsc-index] Starting GSC indexing run")

  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

  try {
    // Get articles published in the last 48 hours that haven't been indexed yet
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const articles = await prisma.digestArticle.findMany({
      where: {
        publishedAt: { gte: cutoff },
      },
      select: { slug: true, title: true },
      orderBy: { publishedAt: "desc" },
      take: 20,
    })

    console.log(`[cron/gsc-index] Found ${articles.length} articles to index since ${cutoff.toISOString()}`)

    if (articles.length === 0) {
      console.log("[cron/gsc-index] No recent articles found, exiting")
      return NextResponse.json({ message: "No recent articles to index", submitted: 0 })
    }

    const results: { slug: string; success: boolean; error?: string }[] = []

    for (const article of articles) {
      const url = `${APP_URL}/digest/${article.slug}`
      try {
        await submitUrlForIndexing(url)
        results.push({ slug: article.slug, success: true })
      } catch (err) {
        results.push({
          slug: article.slug,
          success: false,
          error: err instanceof Error ? err.message : "Unknown error",
        })
      }
    }

    const succeeded = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success).length

    return NextResponse.json({
      message: `Submitted ${succeeded} URLs to GSC. ${failed} failed.`,
      submitted: succeeded,
      failed,
      results,
    })
  } catch (err) {
    console.error("[cron/gsc-index] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
