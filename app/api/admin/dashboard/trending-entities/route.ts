import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { getTrendingEntities } from "@/lib/trending-entities"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    const result = await getTrendingEntities()
    return NextResponse.json(result)
  } catch (error) {
    console.error("[v0] Error computing trending entities:", error)
    return NextResponse.json({ error: "Failed to compute trending entities" }, { status: 500 })
  }
}
