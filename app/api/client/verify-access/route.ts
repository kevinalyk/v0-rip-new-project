import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const slug = searchParams.get("slug") || searchParams.get("clientSlug")

    console.log("[v0] Verifying access for slug:", slug)

    if (!slug) {
      return NextResponse.json({ error: "Slug is required" }, { status: 400 })
    }

    const currentUser = (await getCurrentUser()) as any

    if (!currentUser || !currentUser.userId) {
      console.log("[v0] No authenticated user")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get user with client info
    const user = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: {
        role: true,
        clientId: true,
        client: {
          select: {
            slug: true,
          },
        },
      },
    })

    console.log("[v0] User found:", { role: user?.role, clientId: user?.clientId, clientSlug: user?.client?.slug })

    if (!user) {
      console.log("[v0] User not found in database")
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.role === "super_admin") {
      console.log("[v0] Super-admin access granted")
      return NextResponse.json({ access: true })
    }

    // Regular users can only access their own client
    if (user.client?.slug === slug) {
      console.log("[v0] User has access to their own client")
      return NextResponse.json({ access: true })
    }

    console.log("[v0] Access denied - user client slug doesn't match")
    return NextResponse.json({ error: "Access denied" }, { status: 403 })
  } catch (error) {
    console.error("[v0] Error verifying access:", error)
    return NextResponse.json({ error: "Failed to verify access" }, { status: 500 })
  }
}
