import { type NextRequest, NextResponse } from "next/server"
import { EngagementSimulator } from "@/lib/engagement-simulator"

export const runtime = "nodejs"

// Allow up to 5 minutes — opens every email via IMAP/Graph across all domain health accounts
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Starting domain health engagement cron job...")

    const simulator = new EngagementSimulator()

    // Force full engagement (open + read every email) for accounts with domainHealthMode = true,
    // regardless of personality/schedule. Link clicking is handled separately by click-domain-health-emails.
    await simulator.simulateDomainHealthEngagement()

    console.log("Domain health engagement cron job completed successfully")

    return NextResponse.json({
      success: true,
      message: "Domain health engagement simulation completed",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Domain health engagement cron job failed:", error)

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
