import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only super-admins can hide campaigns
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = params
    const userId = authResult.user.userId || authResult.user.id

    // Hide the campaign
    const updated = await prisma.competitiveInsightCampaign.update({
      where: { id },
      data: {
        isHidden: true,
        hiddenAt: new Date(),
        hiddenBy: userId,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      campaign: updated,
    })
  } catch (error) {
    console.error("Error hiding competitive insight:", error)
    return NextResponse.json({ error: "Failed to hide competitive insight" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only super-admins can unhide campaigns
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = params

    // Unhide the campaign
    const updated = await prisma.competitiveInsightCampaign.update({
      where: { id },
      data: {
        isHidden: false,
        hiddenAt: null,
        hiddenBy: null,
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      campaign: updated,
    })
  } catch (error) {
    console.error("Error unhiding competitive insight:", error)
    return NextResponse.json({ error: "Failed to unhide competitive insight" }, { status: 500 })
  }
}
