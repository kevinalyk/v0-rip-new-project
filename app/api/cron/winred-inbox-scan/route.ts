import { type NextRequest, NextResponse } from "next/server"
import { scanWinRedInboxes } from "@/lib/winred-inbox-scanner"

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[cron/winred-inbox-scan] Starting WinRed inbox scan...")

  try {
    const { results, totalSaved } = await scanWinRedInboxes()
    console.log(`[cron/winred-inbox-scan] Done. Saved ${totalSaved} new message(s).`, results)
    return NextResponse.json({ success: true, totalSaved, results })
  } catch (error: any) {
    console.error("[cron/winred-inbox-scan] Error:", error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}
