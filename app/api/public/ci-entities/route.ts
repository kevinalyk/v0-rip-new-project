import { type NextRequest, NextResponse } from "next/server"
import { getAllEntitiesWithCounts, getTotalCampaignCount } from "@/lib/ci-entity-utils"

// Public read-only endpoint — no auth required.
// Write operations (POST/PUT/DELETE) are not exposed here.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    if (action === "totalCampaigns") {
      const totalCampaigns = await getTotalCampaignCount()
      return NextResponse.json({ totalCampaigns })
    }

    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "100")
    const party = searchParams.get("party") || undefined
    const state = searchParams.get("state") || undefined
    const type = searchParams.get("type") || undefined
    const search = searchParams.get("search") || undefined

    const result = await getAllEntitiesWithCounts({
      page,
      pageSize,
      party,
      state,
      type,
      search,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in public CI entities API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
