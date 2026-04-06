import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

const DEDUP_WINDOW_SECONDS = 30

// Helper to log visit asynchronously (non-blocking)
// Skips logging if the same IP + user combo was already logged within the dedup window
async function logVisit(data: {
  ip: string
  userAgent: string | null
  referer: string | null
  path: string
  statusCode: number
  userId?: string
  userEmail?: string
  isAuthenticated: boolean
  country?: string | null
  city?: string | null
}) {
  try {
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000)

    const existing = await prisma.siteVisit.findFirst({
      where: {
        ip: data.ip,
        isAuthenticated: data.isAuthenticated,
        userId: data.userId ?? null,
        createdAt: { gte: dedupSince },
      },
      select: { id: true },
    })

    if (existing) return // Skip duplicate

    await prisma.siteVisit.create({ data })
  } catch (e) {
    // Silently fail - don't let tracking break the app
    console.error("[SiteVisit] Failed to log visit:", e)
  }
}

export async function GET(request: Request) {
  try {
    // Extract request metadata for logging
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() 
      || request.headers.get("x-real-ip") 
      || "unknown"
    const userAgent = request.headers.get("user-agent") || null
    const referer = request.headers.get("referer") || null
    // Vercel provides geo headers
    const country = request.headers.get("x-vercel-ip-country") || null
    const city = request.headers.get("x-vercel-ip-city") || null

    const currentUser = (await getCurrentUser()) as any

    if (!currentUser || !currentUser.userId) {
      console.log(`[auth/me] 401 | IP: ${ip} | Country: ${country} | City: ${city}`)
      
      // Log anonymous visit (fire and forget)
      logVisit({
        ip,
        userAgent,
        referer,
        path: "/api/auth/me",
        statusCode: 401,
        isAuthenticated: false,
        country,
        city,
      })
      
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

    console.log(`[auth/me] 200 | User: ${user.email} | IP: ${ip} | Country: ${country}`)
    
    // Log authenticated visit (fire and forget)
    logVisit({
      ip,
      userAgent,
      referer,
      path: "/api/auth/me",
      statusCode: 200,
      userId: user.id,
      userEmail: user.email,
      isAuthenticated: true,
      country,
      city,
    })
    
    return NextResponse.json(user)
  } catch (error) {
    console.error("Error fetching current user:", error)
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 })
  }
}
