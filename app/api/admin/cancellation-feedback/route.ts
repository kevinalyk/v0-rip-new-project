import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

// GET /api/admin/cancellation-feedback — list all cancellation feedback, newest first
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user || user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const entries = await prisma.subscriptionCancellationFeedback.findMany({
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ entries })
  } catch (error) {
    console.error("[cancellation-feedback] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
