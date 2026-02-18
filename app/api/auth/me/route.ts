import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    console.log("[v0] GET /api/auth/me called")
    
    // Log cookies for debugging
    const cookieHeader = request.headers.get("cookie")
    console.log("[v0] Cookie header:", cookieHeader)

    const currentUser = (await getCurrentUser()) as any
    console.log("[v0] Current user from token:", currentUser)

    if (!currentUser || !currentUser.userId) {
      console.log("No authenticated user found")
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        firstLogin: true,
        client: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    })

    if (!user) {
      console.log("User not found in database:", currentUser.userId)
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    console.log("User found:", user.email)
    return NextResponse.json(user)
  } catch (error) {
    console.error("Error fetching current user:", error)
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 })
  }
}
