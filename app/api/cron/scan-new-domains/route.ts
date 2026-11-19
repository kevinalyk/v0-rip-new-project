import { NextResponse } from "next/server"
import { scanNewDomains } from "@/lib/domain-radar"

export const runtime = "nodejs"
export const maxDuration = 300

const DEFAULT_DAYS = 3
const MAX_DAYS = 14

export async function GET(request: Request) {
  try {
    // Same access rule as the other crons: Vercel Cron, or a manual call with the secret.
    const userAgent = request.headers.get("user-agent") || ""
    const isVercelCron = userAgent.includes("vercel-cron")
    const { searchParams } = new URL(request.url)

    if (!isVercelCron) {
      const cronSecret = process.env.CRON_SECRET
      const bearer = request.headers.get("authorization") === `Bearer ${cronSecret}`
      const querySecret = searchParams.get("secret") === cronSecret
      if (!cronSecret || (!bearer && !querySecret)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const requestedDays = Number(searchParams.get("days"))
    const days = Number.isInteger(requestedDays) && requestedDays > 0 ? Math.min(requestedDays, MAX_DAYS) : DEFAULT_DAYS

    const summaries = await scanNewDomains(days)
    return NextResponse.json({ success: true, days, summaries })
  } catch (error) {
    console.error("[scan-new-domains] failed:", error)
    return NextResponse.json({ error: "Scan failed" }, { status: 500 })
  }
}
