import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { categorizeMessage } from "@/lib/ci-entity-utils"

/**
 * Auto-assign a single unassigned message (email campaign or SMS) to an entity
 * by matching donation platform identifiers (WinRed, Anedot, ActBlue, PSQ, Revv)
 * found in its CTA links, or a known CTA domain mapping.
 *
 * Shares its matching logic with the Claude-facing categorize_messages MCP
 * tool - see categorizeMessage in lib/ci-entity-utils.ts - so the admin UI's
 * "Categorize" button and the MCP tool always behave identically.
 *
 * POST /api/admin/auto-assign-single
 * Body: { id: string, type: "email" | "sms" }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { id, type } = body as { id: string; type: "email" | "sms" }

    if (!id || !type) {
      return NextResponse.json({ error: "Missing required fields: id, type" }, { status: 400 })
    }

    const result = await categorizeMessage(id, type)

    if (!result.success) {
      const status = result.reason === "Campaign not found" || result.reason === "SMS not found" ? 404 : 200
      if (status === 404) {
        return NextResponse.json({ error: result.reason }, { status: 404 })
      }
      if (result.reason === "Already assigned") {
        return NextResponse.json({ error: result.reason }, { status: 400 })
      }
      return NextResponse.json({ success: false, reason: result.reason })
    }

    return NextResponse.json({
      success: true,
      entityId: result.entityId,
      entityName: result.entityName,
      method: result.method,
    })
  } catch (error) {
    console.error("[auto-assign-single] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
