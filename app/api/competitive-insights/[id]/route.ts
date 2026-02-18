import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only super-admins can update competitive insights
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = params
    const body = await request.json()
    const { tags } = body

    if (!tags || !Array.isArray(tags)) {
      return NextResponse.json({ error: "Invalid tags" }, { status: 400 })
    }

    // Update the tags
    const updated = await prisma.competitiveInsightCampaign.update({
      where: { id: Number.parseInt(id) },
      data: {
        tags: JSON.stringify(tags),
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      insight: {
        ...updated,
        tags: JSON.parse(updated.tags as string),
        ctaLinks: updated.ctaLinks ? JSON.parse(updated.ctaLinks as string) : [],
      },
    })
  } catch (error) {
    console.error("Error updating competitive insight:", error)
    return NextResponse.json({ error: "Failed to update competitive insight" }, { status: 500 })
  }
}
