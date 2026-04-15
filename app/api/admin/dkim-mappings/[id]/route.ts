import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { verifyAuth } from "@/lib/auth"

const prisma = new PrismaClient()

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { selectorValue, friendlyName, notes } = body

    if (!selectorValue?.trim() || !friendlyName?.trim()) {
      return NextResponse.json({ error: "Selector value and friendly name are required" }, { status: 400 })
    }

    const mapping = await prisma.dkimSenderMapping.update({
      where: { id: params.id },
      data: {
        selectorValue: selectorValue.trim().toLowerCase(),
        friendlyName: friendlyName.trim(),
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json(mapping)
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A mapping for this selector already exists" }, { status: 409 })
    }
    console.error("Error updating DKIM mapping:", error)
    return NextResponse.json({ error: "Failed to update mapping" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await prisma.dkimSenderMapping.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting DKIM mapping:", error)
    return NextResponse.json({ error: "Failed to delete mapping" }, { status: 500 })
  }
}
