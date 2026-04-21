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
    const { friendlyName, orgName, cidr, reverseDns, notes } = body

    const mapping = await prisma.ipSenderMapping.update({
      where: { id: params.id },
      data: {
        friendlyName: friendlyName?.trim() || null,
        orgName: orgName?.trim() || null,
        cidr: cidr?.trim() || null,
        reverseDns: reverseDns?.trim() || null,
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json(mapping)
  } catch (error) {
    console.error("Error updating IP sender mapping:", error)
    return NextResponse.json({ error: "Failed to update mapping" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.ipSenderMapping.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting IP sender mapping:", error)
    return NextResponse.json({ error: "Failed to delete mapping" }, { status: 500 })
  }
}
