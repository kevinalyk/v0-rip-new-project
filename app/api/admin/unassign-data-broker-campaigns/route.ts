import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: Request) {
  const authResult = await verifyAuth(req)

  if (!authResult.success || !authResult.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Only super_admins and admins can perform bulk operations
  if (authResult.user.role !== "super_admin" && authResult.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const dataBrokers = await prisma.ciEntity.findMany({
      where: {
        type: "data_broker",
      },
      select: {
        id: true,
        name: true,
        mappings: {
          select: {
            senderEmail: true,
            senderDomain: true,
          },
        },
      },
    })

    // Extract all sender emails associated with data brokers
    const dataBrokerEmails = new Set<string>()

    for (const broker of dataBrokers) {
      for (const mapping of broker.mappings) {
        if (mapping.senderEmail) {
          dataBrokerEmails.add(mapping.senderEmail)
        }
      }
    }

    const emailArray = Array.from(dataBrokerEmails)

    // Find campaigns from data broker emails (regardless of current assignment)
    const campaignsToUnassign = await prisma.competitiveInsightCampaign.count({
      where: {
        senderEmail: { in: emailArray },
        entityId: { not: null }, // Only count assigned campaigns
      },
    })

    // Unassign all campaigns from data broker emails
    const result = await prisma.competitiveInsightCampaign.updateMany({
      where: {
        senderEmail: { in: emailArray },
        entityId: { not: null }, // Only unassign currently assigned campaigns
      },
      data: {
        entityId: null,
        assignmentMethod: null,
      },
    })

    return NextResponse.json({
      success: true,
      summary: {
        dataBrokers: dataBrokers.length,
        dataBrokerEmails: emailArray.length,
        campaignsUnassigned: result.count,
      },
      dataBrokerNames: dataBrokers.map((db) => db.name),
      sampleEmails: emailArray.slice(0, 10),
    })
  } catch (error) {
    console.error("[v0] Error unassigning campaigns:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to unassign campaigns" },
      { status: 500 },
    )
  }
}
