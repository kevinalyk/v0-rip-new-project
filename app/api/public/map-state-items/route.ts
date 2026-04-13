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
          senderName: true,
          subject: true,
          dateReceived: true,
          entity: {
            select: { id: true, name: true, type: true, party: true, state: true },
          },
        },
        orderBy: { dateReceived: "desc" },
        take: 20,
      }),
      prisma.smsQueue.findMany({
        where: {
          createdAt: { gte: since },
          isHidden: false,
          isDeleted: false,
          entity: { is: { state } },
        },
        select: {
          id: true,
          message: true,
          createdAt: true,
          entity: {
            select: { id: true, name: true, type: true, party: true, state: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ])

    return NextResponse.json({
      emails: emails.map((e) => ({
        id: e.id,
        type: "email",
        senderName: e.senderName,
        subject: e.subject,
        date: e.dateReceived.toISOString(),
        entity: e.entity,
      })),
      sms: smsMessages.map((s) => ({
        id: s.id,
        type: "sms",
        message: s.message,
        date: s.createdAt.toISOString(),
        entity: s.entity,
      })),
    })
  } catch (error) {
    console.error("Error fetching public map state items:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
