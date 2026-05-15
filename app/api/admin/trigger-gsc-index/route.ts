import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

/**
 * POST /api/admin/trigger-gsc-index
 *
 * Manually triggers the GSC indexing cron job.
 * Proxies the request server-side so CRON_SECRET never reaches the browser.
 *
 * Requires: super_admin
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden — super_admin only" }, { status: 403 })
    }

    const cronSecret = process.env.CRON_SECRET
    const headers: HeadersInit = { "Content-Type": "application/json" }
    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`
    }

    const res = await fetch(`${APP_URL}/api/cron/gsc-index`, { headers })
    const json = await res.json()

    return NextResponse.json(json, { status: res.status })
  } catch (err) {
    console.error("[trigger-gsc-index]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
