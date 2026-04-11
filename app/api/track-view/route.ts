import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

// POST /api/track-view
// Increments viewCount for a campaign or SMS message.
// No auth required — this is a fire-and-forget tracking call.
export async function POST(request: NextRequest) {
  try {
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
      // CompetitiveInsightCampaign uses string Cuid ids
      await prisma.competitiveInsightCampaign.update({
        where: { id: String(id) },
        data: { viewCount: { increment: 1 } },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
