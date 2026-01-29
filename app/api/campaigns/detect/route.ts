import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { scanForNewCampaigns } from "@/lib/campaign-detector"

export async function POST(request: Request) {
  try {
    // Check if user is authenticated
    const isAuth = await isAuthenticated(request)
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get request body
    const { daysToScan = 1, minInboxCount = 2, maxEmailsPerSeed = 50 } = await request.json()

    console.log(
      `Starting campaign detection with params: days=${daysToScan}, minCount=${minInboxCount}, maxEmails=${maxEmailsPerSeed}`,
    )

    // Run the campaign detection
    const result = await scanForNewCampaigns({
      daysToScan,
      minInboxCount,
      maxEmailsPerSeed,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in campaign detection API:", error)
    return NextResponse.json(
      { error: "Failed to detect campaigns", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
