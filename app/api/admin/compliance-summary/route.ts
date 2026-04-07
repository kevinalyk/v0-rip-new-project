import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { verifySession } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies()
    const session = await verifySession(cookieStore)

    if (!session || session.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "50")
    const skip = (page - 1) * pageSize

    const [total, rows] = await Promise.all([
      prisma.cIEmailCompliance.count(),
      prisma.cIEmailCompliance.findMany({
        skip,
        take: pageSize,
        orderBy: { checkedAt: "desc" },
        include: {
          campaign: {
            select: {
              id: true,
              senderName: true,
              senderEmail: true,
              subject: true,
              dateReceived: true,
              inboxCount: true,
              spamCount: true,
              notDeliveredCount: true,
              inboxRate: true,
              entityId: true,
              entity: {
                select: {
                  id: true,
                  name: true,
                  type: true,
                  party: true,
                  state: true,
                },
              },
              source: true,
            },
          },
        },
      }),
    ])

    // Aggregate stats
    const allScores = await prisma.cIEmailCompliance.findMany({
      select: {
        totalScore: true,
        section1Score: true,
        section2Score: true,
        section3Score: true,
        section4Score: true,
        hasSpf: true,
        hasDkim: true,
        hasTls: true,
        hasDmarc: true,
        hasOneClickUnsubscribeHeaders: true,
        hasUnsubscribeLinkInBody: true,
        noHiddenContent: true,
      },
    })

    const count = allScores.length
    const avg = (field: (keyof typeof allScores[0])) =>
      count > 0
        ? allScores.filter((r) => r[field] === true).length / count
        : 0

    const avgScore = (field: keyof typeof allScores[0]) => {
      const vals = allScores.map((r) => r[field] as number | null).filter((v) => v != null) as number[]
      return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    }

    const stats = {
      total: count,
      avgTotalScore: avgScore("totalScore"),
      avgSection1: avgScore("section1Score"),
      avgSection2: avgScore("section2Score"),
      avgSection3: avgScore("section3Score"),
      avgSection4: avgScore("section4Score"),
      spfRate: avg("hasSpf"),
      dkimRate: avg("hasDkim"),
      tlsRate: avg("hasTls"),
      dmarcRate: avg("hasDmarc"),
      oneClickUnsubRate: avg("hasOneClickUnsubscribeHeaders"),
      unsubBodyRate: avg("hasUnsubscribeLinkInBody"),
      noHiddenContentRate: avg("noHiddenContent"),
    }

    return NextResponse.json({ rows, total, page, pageSize, stats })
  } catch (error) {
    console.error("[compliance-summary] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
