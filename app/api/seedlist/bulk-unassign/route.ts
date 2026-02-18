import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
      },
    })

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Only super admins can bulk unassign
    if (userRecord.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    // Locked seeds (client-owned) cannot be unassigned
    const result = await prisma.seedEmail.updateMany({
      where: {
        locked: false, // Only update unlocked seeds
      },
      data: {
        assignedToClient: "RIP",
      },
    })

    console.log(`[v0] Bulk unassigned ${result.count} seed emails (locked seeds were skipped)`)

    return NextResponse.json({
      success: true,
      count: result.count,
      message: `Successfully unassigned ${result.count} seed email(s). Locked seeds were not affected.`,
    })
  } catch (error) {
    console.error("Error bulk unassigning seed emails:", error)
    return NextResponse.json({ error: "Failed to unassign seed emails" }, { status: 500 })
  }
}
