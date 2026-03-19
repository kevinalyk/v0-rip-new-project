import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { clientId: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const users = await prisma.user.findMany({
      where: { clientId: params.clientId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        lastActive: true,
        createdAt: true,
      },
      orderBy: { lastActive: "desc" },
    })

    return NextResponse.json(users)
  } catch (error) {
    console.error("Error fetching client users:", error)
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 })
  }
}
