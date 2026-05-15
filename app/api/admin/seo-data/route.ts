import { NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { cookies } from "next/headers"
import { getTopPages, getTopSearchTerms } from "@/lib/ga4"
import { getTopQueries, getTopPages as getGscTopPages } from "@/lib/gsc"

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("token")?.value
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = await verifyToken(token)
    if (!user || user.role !== "super_admin") {
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
