import { NextResponse } from "next/server"
import { scanForCompetitiveInsights } from "@/lib/campaign-detector"
import { ensureDatabaseConnection } from "@/lib/prisma"

export const runtime = "nodejs"
// Match the 5-minute ceiling used by our other long-running cron jobs. This route was
// previously missing maxDuration entirely, so it ran on the platform default and could
// get cut off with FUNCTION_INVOCATION_TIMEOUT well before the work actually finished.
export const maxDuration = 300

// Reads an optional `?providers=gmail,yahoo` query param so this single route can be
// scheduled multiple times in vercel.json, once per email-provider bucket. This keeps one
// slow/timing-out provider (e.g. an IMAP auth hiccup) from consuming the whole run's time
// budget and blocking the others. Omit the param to scan every provider in one run, which
// is what the manual "run now" admin trigger and any ad-hoc invocation still do.
function getProvidersFromRequest(request: Request): string[] | undefined {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get("providers")
  if (!raw) return undefined
  const providers = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  return providers.length ? providers : undefined
}

async function handleCompetitiveInsightsCron(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const providers = getProvidersFromRequest(request)

    // console.log("🕐 CRON: Starting competitive insights detection...", providers)

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
      providers,
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

export async function GET(request: Request) {
  return handleCompetitiveInsightsCron(request)
}

export async function POST(request: Request) {
  return handleCompetitiveInsightsCron(request)
}
