import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

/**
 * GET /api/user/settings
 * Returns the authenticated user's personal settings.
 */
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { digestEnabled: true, weeklyDigestEnabled: true },
    })

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({
      digestEnabled: dbUser.digestEnabled,
      weeklyDigestEnabled: dbUser.weeklyDigestEnabled,
    })
  } catch (error) {
    console.error("Error fetching user settings:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

/**
 * PUT /api/user/settings
 * Updates the authenticated user's personal settings.
 * Body: { digestEnabled?: boolean }
 */
export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const body = await request.json()
    const { digestEnabled, weeklyDigestEnabled } = body

    if (digestEnabled !== undefined && typeof digestEnabled !== "boolean") {
      return NextResponse.json({ error: "digestEnabled must be a boolean" }, { status: 400 })
    }
    if (weeklyDigestEnabled !== undefined && typeof weeklyDigestEnabled !== "boolean") {
      return NextResponse.json({ error: "weeklyDigestEnabled must be a boolean" }, { status: 400 })
    }

    const updateData: Record<string, boolean> = {}
    if (digestEnabled !== undefined) updateData.digestEnabled = digestEnabled
    if (weeklyDigestEnabled !== undefined) updateData.weeklyDigestEnabled = weeklyDigestEnabled

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    })

    return NextResponse.json({ success: true, ...updateData })
  } catch (error) {
    console.error("Error updating user settings:", error)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
