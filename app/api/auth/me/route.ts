import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    // Extract request metadata for logging
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || request.headers.get("x-real-ip") 
      || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"
    const referer = request.headers.get("referer") || "direct"
    const cookieHeader = request.headers.get("cookie")
    const hasAuthCookie = cookieHeader?.includes("auth_token") || false

    const currentUser = (await getCurrentUser()) as any

    if (!currentUser || !currentUser.userId) {
      console.log(`[auth/me] 401 | IP: ${ip} | UA: ${userAgent.substring(0, 80)} | Referer: ${referer} | Has Cookie: ${hasAuthCookie}`)
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
      console.log(`[auth/me] 404 | User ID not in DB: ${currentUser.userId} | IP: ${ip}`)
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    console.log(`[auth/me] 200 | User: ${user.email} | IP: ${ip}`)
    return NextResponse.json(user)
  } catch (error) {
    console.error("Error fetching current user:", error)
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 })
  }
}
