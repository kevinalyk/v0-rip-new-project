import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { friendlyName, notes } = body

    const mapping = await prisma.unsubDomainMapping.update({
      where: { id: params.id },
      data: {
        friendlyName: friendlyName?.trim() || null,
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json(mapping)
  } catch (error) {
    console.error("Error updating unsub domain mapping:", error)
    return NextResponse.json({ error: "Failed to update mapping" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.unsubDomainMapping.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting unsub domain mapping:", error)
    return NextResponse.json({ error: "Failed to delete mapping" }, { status: 500 })
  }
}
