import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

// PATCH /api/admin/changelog/[id] — update an entry
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user || user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, category, plan, publishedAt } = body

    const entry = await prisma.changelog.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(category !== undefined && { category: category.trim() }),
        ...(plan !== undefined && { plan: plan?.trim() || null }),
        ...(publishedAt !== undefined && { publishedAt: new Date(publishedAt) }),
        updatedAt: new Date(),
      },
    })

    return NextResponse.json({ entry })
  } catch (error) {
    console.error("[changelog] PATCH error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE /api/admin/changelog/[id] — delete an entry
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user || user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.changelog.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[changelog] DELETE error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
