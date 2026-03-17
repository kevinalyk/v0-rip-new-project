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

    console.log("Starting RIP seed engagement cron job...")

    const simulator = new EngagementSimulator()
    await simulator.simulateRipEngagement()

    console.log("RIP seed engagement cron job completed successfully")

    return NextResponse.json({
      success: true,
      message: "RIP seed engagement completed",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("RIP seed engagement cron job failed:", error)

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
