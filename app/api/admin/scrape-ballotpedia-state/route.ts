import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { url } = body

    if (!url || !url.includes("ballotpedia.org")) {
      return NextResponse.json({ error: "A valid Ballotpedia URL is required" }, { status: 400 })
    }

    // Fetch the raw HTML — strip the hash fragment since it's client-side only
    const fetchUrl = url.split("#")[0]
    console.log("[scrape-ballotpedia-state] Fetching:", fetchUrl)

    const res = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; InboxGOP/1.0)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    })

    console.log("[scrape-ballotpedia-state] HTTP status:", res.status)
    const html = await res.text()
    console.log("[scrape-ballotpedia-state] HTML length:", html.length)

    // Return the raw HTML as a text file for inspection
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="ballotpedia-raw-${Date.now()}.html"`,
      },
    })
  } catch (err: any) {
    console.error("[scrape-ballotpedia-state] Error:", err.message)
    return NextResponse.json({ error: err.message || "Failed to fetch page" }, { status: 500 })
  }
}
