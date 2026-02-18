import { NextResponse } from "next/server"
import { scanForCompetitiveInsights } from "@/lib/campaign-detector"
import { ensureDatabaseConnection } from "@/lib/prisma"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // console.log("🕐 CRON: Starting competitive insights detection...")

    const dbConnected = await ensureDatabaseConnection()
    if (!dbConnected) {
      // console.error("❌ CRON: Failed to establish database connection")
      return NextResponse.json(
        {
          error: "Database connection failed",
          details: "Could not establish connection to database",
        },
        { status: 500 },
      )
    }

    // console.log("✅ CRON: Database connection verified")

    const result = await scanForCompetitiveInsights({
      daysToScan: 1,
      maxEmailsPerSeed: 50,
    })

    // console.log("🕐 CRON: Competitive insights detection complete:", result)

    return NextResponse.json(result)
  } catch (error) {
    // console.error("❌ CRON: Error in competitive insights detection:", error)
    return NextResponse.json(
      {
        error: "Failed to detect competitive insights",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // console.log("🕐 CRON: Starting competitive insights detection...")

    const dbConnected = await ensureDatabaseConnection()
    if (!dbConnected) {
      // console.error("❌ CRON: Failed to establish database connection")
      return NextResponse.json(
        {
          error: "Database connection failed",
          details: "Could not establish connection to database",
        },
        { status: 500 },
      )
    }

    // console.log("✅ CRON: Database connection verified")

    const result = await scanForCompetitiveInsights({
      daysToScan: 1,
      maxEmailsPerSeed: 50,
    })

    // console.log("🕐 CRON: Competitive insights detection complete:", result)

    return NextResponse.json(result)
  } catch (error) {
    // console.error("❌ CRON: Error in competitive insights detection:", error)
    return NextResponse.json(
      {
        error: "Failed to detect competitive insights",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
