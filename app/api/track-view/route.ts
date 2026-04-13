import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// POST /api/track-view
// Increments viewCount for a campaign or SMS message.
// Requires auth to prevent anonymous inflation.
export async function POST(request: NextRequest) {
  try {
    // Require a valid session — unauthenticated callers should not count
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { id, type } = body

    if (!id || !type) {
      return NextResponse.json({ error: "id and type are required" }, { status: 400 })
    }

    if (type === "sms") {
      await prisma.smsQueue.update({
        where: { id: String(id) },
        data: { viewCount: { increment: 1 } },
      })
    } else {
      await prisma.competitiveInsightCampaign.update({
        where: { id: String(id) },
        data: { viewCount: { increment: 1 } },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[track-view] error:", error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
