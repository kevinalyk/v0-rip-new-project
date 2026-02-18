import { NextResponse } from "next/server"
import { getAuthenticatedUser, isSystemAdmin } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Try to find as a regular Campaign first
    const regularCampaign = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: {
        results: true,
        domain: true,
        emailContent: true,
      },
    })

    if (regularCampaign) {
      // Check if user has access to this campaign
      const isUserAdmin = await isSystemAdmin(userId)
      if (!isUserAdmin && regularCampaign.assignedToClientId !== user.clientId) {
        return NextResponse.json({ error: "Forbidden - You don't have access to this campaign" }, { status: 403 })
      }

      // Transform the campaign data for the frontend
      const transformedCampaign = {
        ...regularCampaign,
        deliveryRate: regularCampaign.deliveryRate || 0,
        results: regularCampaign.results.map((result) => ({
          id: result.id,
          seedEmail: result.seedEmail,
          emailProvider: result.emailProvider || "unknown",
          delivered: result.delivered,
          inboxed: result.inboxed,
          placementStatus: result.placementStatus,
          forwardedAt: result.forwardedAt,
          emailSender: regularCampaign.fromEmail,
        })),
      }

      return NextResponse.json(transformedCampaign)
    }

    // If not found as regular campaign, try CompetitiveInsightCampaign
    const ciCampaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { id: params.id },
      include: {
        entity: true,
      },
    })

    if (ciCampaign) {
      // CI campaigns are accessible to all authenticated users (or check specific permissions)
      return NextResponse.json(ciCampaign)
    }

    // Campaign not found in either table
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  } catch (error) {
    console.error("Error fetching campaign details:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch campaign details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const isUserAdmin = await isSystemAdmin(userId)

    if (!isUserAdmin) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    // Try to find and delete as regular Campaign first
    const regularCampaign = await prisma.campaign.findUnique({
      where: { id: params.id },
    })

    if (regularCampaign) {
      await prisma.campaign.delete({
        where: { id: params.id },
      })
      return NextResponse.json({ message: "Campaign deleted successfully" })
    }

    const ciCampaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { id: params.id },
    })

    if (ciCampaign) {
      // Soft delete instead of hard delete
      await prisma.competitiveInsightCampaign.update({
        where: { id: params.id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: userId,
        },
      })
      return NextResponse.json({ message: "Campaign deleted successfully" })
    }

    // Campaign not found in either table
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
  } catch (error) {
    console.error("Error deleting campaign:", error)
    return NextResponse.json(
      {
        error: "Failed to delete campaign",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
