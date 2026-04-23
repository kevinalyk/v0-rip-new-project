import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

/**
 * POST /api/admin/ip-sender-mappings/re-resolve
 *
 * Resets all auto-resolved RDAP data (orgName, cidr, rdapChecked) so the
 * next cron run re-resolves every IP with the corrected lookupRdap logic.
 * Rows with a manually-set friendlyName are preserved unless force=true.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const force = body?.force === true // if true, also wipe rows with a friendlyName

    const where = force ? {} : { friendlyName: null }

    const { count } = await prisma.ipSenderMapping.updateMany({
      where,
      data: {
        orgName: null,
        cidr: null,
        rdapChecked: false,
        lastLookedUpAt: null,
      },
    })

    return NextResponse.json({
      success: true,
      reset: count,
      message: `Reset ${count} IP mapping${count !== 1 ? "s" : ""}. The next cron run will re-resolve them.`,
    })
  } catch (error) {
    console.error("Error resetting IP mappings:", error)
    return NextResponse.json({ error: "Failed to reset IP mappings" }, { status: 500 })
  }
}
