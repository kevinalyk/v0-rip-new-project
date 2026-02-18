import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { scanForCompetitiveInsights } from "@/lib/campaign-detector"

export async function POST(request: Request) {
  try {
    // Check if user is authenticated
    const isAuth = await isAuthenticated(request)
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get request body
    const { daysToScan = 1, maxEmailsPerSeed = 50 } = await request.json()

    console.log(
      `Starting competitive insights detection with params: days=${daysToScan}, maxEmails=${maxEmailsPerSeed}`,
    )

    // Run the competitive insights detection
    const result = await scanForCompetitiveInsights({
      daysToScan,
      maxEmailsPerSeed,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in competitive insights detection API:", error)
    return NextResponse.json(
      {
        error: "Failed to detect competitive insights",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
