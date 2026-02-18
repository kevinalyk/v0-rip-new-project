import { type NextRequest, NextResponse } from "next/server"
import { EngagementSimulator } from "@/lib/engagement-simulator"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Starting engagement simulation cron job...")

    const simulator = new EngagementSimulator()

    // Initialize personalities for new accounts (if needed)
    await simulator.initializeAccountPersonalities()

    // Run engagement simulation
    await simulator.simulateEngagement()

    console.log("Engagement simulation cron job completed successfully")

    return NextResponse.json({
      success: true,
      message: "Engagement simulation completed",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Engagement simulation cron job failed:", error)

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
