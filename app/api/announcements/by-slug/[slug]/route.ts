import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const announcement = await prisma.announcement.findUnique({
      where: { slug: params.slug },
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
