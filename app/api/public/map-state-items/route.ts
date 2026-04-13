import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// Fully public — no auth required (directory is publicly accessible)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const state = searchParams.get("state")

    if (!state) {
      return NextResponse.json({ error: "Missing state param" }, { status: 400 })
    }

    const since = new Date(Date.now() - 3 * 60 * 60 * 1000)

    const [emails, smsMessages] = await Promise.all([
      prisma.competitiveInsightCampaign.findMany({
        where: {
          createdAt: { gte: since },
          isHidden: false,
          isDeleted: false,
          entity: { is: { state } },
        },
        select: {
          id: true,
          subject: true,
          senderName: true,
          senderEmail: true,
          createdAt: true,
          entity: {
            select: { id: true, name: true, imageUrl: true, type: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.smsQueue.findMany({
        where: {
          createdAt: { gte: since },
          isHidden: false,
          isDeleted: false,
          entityId: { not: null },
          entity: { is: { state } },
        },
        select: {
          id: true,
          message: true,
          phoneNumber: true,
          createdAt: true,
          entity: {
            select: { id: true, name: true, imageUrl: true, type: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ])

    return NextResponse.json({ emails, smsMessages, state, since: since.toISOString() })
  } catch (error) {
    console.error("Error fetching public map state items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
