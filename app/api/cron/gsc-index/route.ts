import { NextResponse } from "next/server"
import { submitUrlsForIndexing } from "@/lib/gsc"
import { prisma } from "@/lib/prisma"

// Called by Vercel Cron or manually — submits recently published digest articles to GSC for indexing
export async function GET(request: Request) {
  // Allow Vercel's own cron runner (x-vercel-cron header) OR a valid Bearer token
  const authHeader = request.headers.get("authorization")
  const isVercelCron = request.headers.get("x-vercel-cron") === "1"
  const cronSecret = process.env.CRON_SECRET

  if (!isVercelCron && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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

    const urls = articles.map((a) => `${APP_URL}/digest/${a.slug}`)

    try {
      await submitUrlsForIndexing(urls)
      console.log(`[cron/gsc-index] Successfully submitted ${urls.length} URL(s) via IndexNow`)
      return NextResponse.json({
        message: `Submitted ${urls.length} URL(s) via IndexNow.`,
        submitted: urls.length,
        urls,
      })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Unknown error"
      console.error(`[cron/gsc-index] IndexNow submission failed: ${errMsg}`)
      return NextResponse.json({ error: errMsg }, { status: 500 })
    }
  } catch (err) {
    console.error("[cron/gsc-index] Error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    )
  }
}
