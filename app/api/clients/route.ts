import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    console.log("[v0] Fetching clients for super-admin")
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value

    if (!token) {
      console.log("[v0] No auth token found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      console.log("[v0] Invalid token")
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    console.log("[v0] Token payload:", payload)

    // Get user to check if they're a super admin
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { role: true },
    })

    console.log("[v0] User role:", user?.role)

    if (!user || user.role !== "super_admin") {
      console.log("[v0] User is not super admin")
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const clients = await prisma.client.findMany({
      where: {
        active: true,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        subscriptionPlan: true,
        hasCompetitiveInsights: true,
      },
      orderBy: {
        name: "asc",
      },
    })

    console.log("[v0] Found clients:", clients.length, clients)
    return NextResponse.json(clients)
  } catch (error) {
    console.error("Error fetching clients:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
