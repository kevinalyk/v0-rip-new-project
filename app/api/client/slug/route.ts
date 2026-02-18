import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const currentUser = (await getCurrentUser()) as any

    if (!currentUser || !currentUser.userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Get user with client info
    const user = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      include: {
        client: {
          select: {
            slug: true,
          },
        },
      },
    })

    if (!user || !user.client || !user.client.slug) {
      return NextResponse.json({ error: "Client slug not found" }, { status: 404 })
    }

    return NextResponse.json({ slug: user.client.slug })
  } catch (error) {
    console.error("Error fetching client slug:", error)
    return NextResponse.json({ error: "Failed to fetch client slug" }, { status: 500 })
  }
}
