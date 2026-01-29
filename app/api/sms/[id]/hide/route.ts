import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only super-admins can hide SMS
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = params
    const userId = authResult.user.userId || authResult.user.id

    // Hide the SMS
    const updated = await prisma.smsQueue.update({
      where: { id },
      data: {
        isHidden: true,
        hiddenAt: new Date(),
        hiddenBy: userId,
      },
    })

    return NextResponse.json({
      success: true,
      sms: updated,
    })
  } catch (error) {
    console.error("Error hiding SMS:", error)
    return NextResponse.json({ error: "Failed to hide SMS" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only super-admins can unhide SMS
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { id } = params

    // Unhide the SMS
    const updated = await prisma.smsQueue.update({
      where: { id },
      data: {
        isHidden: false,
        hiddenAt: null,
        hiddenBy: null,
      },
    })

    return NextResponse.json({
      success: true,
      sms: updated,
    })
  } catch (error) {
    console.error("Error unhiding SMS:", error)
    return NextResponse.json({ error: "Failed to unhide SMS" }, { status: 500 })
  }
}
