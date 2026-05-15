import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { getTopPages, getTopSearchTerms } from "@/lib/ga4"
import { getTopSearchQueries as getTopQueries, getTopSearchPages as getGscTopPages } from "@/lib/gsc"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "28")

    const [ga4Pages, ga4Terms, gscQueries, gscPages] = await Promise.allSettled([
      getTopPages(days),
      getTopSearchTerms(days),
      getTopQueries(days),
      getGscTopPages(days),
    ])

    return NextResponse.json({
      ga4: {
        topPages: ga4Pages.status === "fulfilled" ? ga4Pages.value : [],
        topSearchTerms: ga4Terms.status === "fulfilled" ? ga4Terms.value : [],
        error: ga4Pages.status === "rejected" ? String(ga4Pages.reason) : null,
      },
      gsc: {
        topQueries: gscQueries.status === "fulfilled" ? gscQueries.value : [],
        topPages: gscPages.status === "fulfilled" ? gscPages.value : [],
        error: gscQueries.status === "rejected" ? String(gscQueries.reason) : null,
      },
    })
  } catch (err) {
    console.error("[api/admin/seo-data]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
