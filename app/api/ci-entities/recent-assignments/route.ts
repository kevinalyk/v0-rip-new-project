import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest) {
  const authResult = await verifyAuth(request)

  if (!authResult.success || authResult.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const limit = Number.parseInt(searchParams.get("limit") || "50")

    const recentEmails = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: { not: null },
        assignedAt: { not: null },
      },
      select: {
        id: true,
        subject: true,
        senderName: true,
        senderEmail: true,
        assignmentMethod: true,
        assignedAt: true,
        dateReceived: true,
        inboxRate: true,
        emailPreview: true,
        emailContent: true,
        ctaLinks: true,
        entity: {
          select: {
            id: true,
            name: true,
            party: true,
            type: true,
          },
        },
      },
      orderBy: { assignedAt: "desc" },
      take: limit,
    })

    const recentSms = await prisma.smsQueue.findMany({
      where: {
        entityId: { not: null },
        assignedAt: { not: null },
      },
      select: {
        id: true,
        message: true,
        phoneNumber: true,
        toNumber: true,
        assignmentMethod: true,
        assignedAt: true,
        createdAt: true,
        ctaLinks: true,
        entity: {
          select: {
            id: true,
            name: true,
            party: true,
            type: true,
          },
        },
      },
      orderBy: { assignedAt: "desc" },
      take: limit,
    })

    // Combine and sort by assignedAt
    const combined = [
      ...recentEmails.map((email) => ({
        ...email,
        type: "email" as const,
        title: email.subject,
        sender: `${email.senderName} (${email.senderEmail})`,
      })),
      ...recentSms.map((sms) => ({
        ...sms,
        type: "sms" as const,
        title: sms.message?.substring(0, 100) + (sms.message && sms.message.length > 100 ? "..." : ""),
        sender: sms.phoneNumber || "Unknown",
        dateReceived: sms.createdAt,
        inboxRate: null,
        subject: sms.message?.substring(0, 100) + (sms.message && sms.message.length > 100 ? "..." : ""),
        emailPreview: sms.message,
        emailContent: null,
      })),
    ]
      .sort((a, b) => {
        const aDate = a.assignedAt ? new Date(a.assignedAt).getTime() : 0
        const bDate = b.assignedAt ? new Date(b.assignedAt).getTime() : 0
        return bDate - aDate
      })
      .slice(0, limit)

    return NextResponse.json({ assignments: combined })
  } catch (error) {
    console.error("[CI Recent Assignments] Error fetching recent assignments:", error)
    return NextResponse.json({ error: "Failed to fetch recent assignments" }, { status: 500 })
  }
}
