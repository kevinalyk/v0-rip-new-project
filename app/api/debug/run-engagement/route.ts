import { type NextRequest, NextResponse } from "next/server"
import { EngagementSimulator } from "@/lib/engagement-simulator"
import { verifyAuth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    // Verify user is authenticated
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Starting manual engagement simulation...")

    const simulator = new EngagementSimulator()

    // Initialize personalities for new accounts (if needed)
    await simulator.initializeAccountPersonalities()

    // Run engagement simulation
    await simulator.simulateEngagement()

    console.log("Manual engagement simulation completed successfully")

    return NextResponse.json({
      success: true,
      message: "Engagement simulation completed successfully",
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Manual engagement simulation failed:", error)

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
