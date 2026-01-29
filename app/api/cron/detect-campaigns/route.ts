import { NextResponse } from "next/server"
import { scanForNewCampaigns } from "@/lib/campaign-detector"

export const runtime = "nodejs"

// This endpoint will be called by a cron job (e.g., Vercel Cron)
export async function GET(request: Request) {
  try {
    console.log("Starting automated campaign detection")

    // Run the campaign detection with default parameters
    const result = await scanForNewCampaigns({
      daysToScan: 1, // Look at the last day
      minInboxCount: 2, // Minimum 2 inboxes to consider it a campaign
      maxEmailsPerSeed: 50, // Limit to 50 emails per seed account for performance
    })

    return NextResponse.json({
      success: result.success,
      newCampaigns: result.newCampaigns,
      totalEmails: result.totalEmails,
      message: `Detected ${result.newCampaigns} new campaigns from ${result.totalEmails} emails`,
    })
  } catch (error) {
    console.error("Error in automated campaign detection:", error)
    return NextResponse.json(
      { error: "Failed to detect campaigns", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
