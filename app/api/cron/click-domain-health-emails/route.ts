import { type NextRequest, NextResponse } from "next/server"
import { simulateDomainHealthLinkClicks, initializeDomainHealthClickRates } from "@/lib/link-click-simulator"

export const runtime = "nodejs"

// Allow up to 5 minutes — link clicking involves real HTTP requests + IMAP connections
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Starting domain health link click cron job...")

    // Initialize click rates for any new domain health seeds first
    await initializeDomainHealthClickRates()

    // Run the link click simulation
    const result = await simulateDomainHealthLinkClicks()

    console.log("Domain health link click cron job completed:", result)

    return NextResponse.json({
      success: true,
      message: "Domain health link click simulation completed",
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Domain health link click cron job failed:", error)

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
