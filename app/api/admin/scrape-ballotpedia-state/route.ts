import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { scrapeStateLevelElection } from "@/lib/ballotpedia-state-scraper"

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { url } = body

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Validate it's a Ballotpedia URL
    if (!url.includes("ballotpedia.org")) {
      return NextResponse.json(
        { error: "URL must be a Ballotpedia state election page" },
        { status: 400 },
      )
    }

    console.log("[scrape-ballotpedia-state] Scraping:", url)

    // Scrape the page
    const candidates = await scrapeStateLevelElection(url)

    console.log(`[scrape-ballotpedia-state] Found ${candidates.length} candidates`)

    // Return as JSON for download
    return NextResponse.json(
      {
        success: true,
        url,
        candidateCount: candidates.length,
        data: candidates,
      },
      {
        headers: {
          "Content-Disposition": `attachment; filename="ballotpedia-candidates-${Date.now()}.json"`,
          "Content-Type": "application/json",
        },
      },
    )
  } catch (err: any) {
    console.error("[scrape-ballotpedia-state] Error:", err.message)
    return NextResponse.json(
      { error: err.message || "Failed to scrape page" },
      { status: 500 },
    )
  }
}
