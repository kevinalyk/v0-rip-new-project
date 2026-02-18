import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only super-admins can delete SMS
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = params

    const sms = await prisma.smsQueue.findUnique({
      where: { id },
    })

    if (!sms) {
      return NextResponse.json({ error: "SMS not found" }, { status: 404 })
    }

    await prisma.smsQueue.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: authResult.user.id,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting SMS:", error)
    return NextResponse.json({ error: "Failed to delete SMS" }, { status: 500 })
  }
}
