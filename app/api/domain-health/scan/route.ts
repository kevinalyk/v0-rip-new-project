import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { runDomainHealthScan, getLatestScanResults } from "@/lib/domain-health-scanner"

export const maxDuration = 300
export const runtime = "nodejs"

// GET — return the latest scan results for a clientDomainId
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clientDomainId = request.nextUrl.searchParams.get("clientDomainId")
    if (!clientDomainId) {
      return NextResponse.json({ error: "clientDomainId is required" }, { status: 400 })
    }

    const { scan, results } = await getLatestScanResults(clientDomainId)
    return NextResponse.json({ scan, results })
  } catch (err) {
    console.error("[domain-health/scan GET] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST — trigger a new scan for a clientDomainId
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { clientDomainId } = body

    if (!clientDomainId) {
      return NextResponse.json({ error: "clientDomainId is required" }, { status: 400 })
    }

    // Verify the domain exists
    const clientDomain = await prisma.clientDomain.findUnique({
      where: { id: clientDomainId },
      select: { id: true, domain: true, clientId: true, verificationStatus: true },
    })

    if (!clientDomain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    }

    if (clientDomain.verificationStatus !== "verified") {
      return NextResponse.json({ error: "Domain must be verified before scanning" }, { status: 400 })
    }

    console.log(`[domain-health/scan] Starting manual scan for ${clientDomain.domain} (${clientDomainId})`)

    const result = await runDomainHealthScan(clientDomainId, "manual")

    // Return the fresh results
    const { scan, results } = await getLatestScanResults(clientDomainId)

    return NextResponse.json({
      success: true,
      scanId: result.scanId,
      seedEmailCount: result.seedEmailCount,
      ciRowCount: result.ciRowCount,
      checkCount: result.checkCount,
      scan,
      results,
    })
  } catch (err) {
    console.error("[domain-health/scan POST] Error:", err)
    return NextResponse.json(
      { error: "Scan failed", details: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
