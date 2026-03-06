import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    // Allow unauthenticated requests for OG metadata scraping (indicated by ?public=1)
    // Full announcement data (body) still requires auth
    const isPublicRequest = request.nextUrl.searchParams.get("public") === "1"

    if (!isPublicRequest) {
      const authResult = await verifyAuth(request)
      if (!authResult.success || !authResult.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const announcement = await prisma.announcement.findUnique({
      where: { slug: params.slug },
      // For public requests, only return the fields needed for OG metadata
      select: isPublicRequest
        ? { title: true, slug: true, publishedAt: true, body: true, imageUrl: true }
        : undefined,
    })

    if (!announcement) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json(announcement)
  } catch (error) {
    console.error("Error fetching announcement by slug:", error)
    return NextResponse.json({ error: "Failed to fetch announcement" }, { status: 500 })
  }
}
