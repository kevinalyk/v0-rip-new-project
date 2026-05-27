import { type NextRequest, NextResponse } from "next/server"
import { runTwitterPost } from "@/app/api/admin/twitter-post/route"

/**
 * Cron: Post to X (Twitter) 3× per day — 9 AM, 3 PM, 9 PM ET
 * Schedule (UTC, ET = UTC-4 in summer / UTC-5 in winter):
 *   "0 13 * * *"  →  9 AM ET (EDT)
 *   "0 19 * * *"  →  3 PM ET (EDT)
 *   "0 1 * * *"   →  9 PM ET (EDT)
 *
 * NOTE: This cron is NOT registered in vercel.json yet.
 * Add the three schedule entries below once admin-tool testing is complete:
 *
 *   { "path": "/api/cron/twitter-post", "schedule": "0 13 * * *" },
 *   { "path": "/api/cron/twitter-post", "schedule": "0 19 * * *" },
 *   { "path": "/api/cron/twitter-post", "schedule": "0 1 * * *"  },
 */
export async function GET(request: NextRequest) {
  // PAUSED — re-enable by removing this block and re-adding the cron entry to vercel.json
  return NextResponse.json({ message: "Twitter bot is currently paused" }, { status: 200 })

  // Validate Vercel cron secret
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  try {
    const result = await runTwitterPost()
    return NextResponse.json(result, { status: result.status })
  } catch (error) {
    console.error("[cron/twitter-post] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
