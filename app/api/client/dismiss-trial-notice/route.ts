import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

// POST /api/client/dismiss-trial-notice — marks the "your trial ended, subscribe" popup as seen
// for the current user's client, so it doesn't show again until the next trial ends.
export async function POST() {
  try {
    const currentUser = (await getCurrentUser()) as any
    if (!currentUser || !currentUser.userId) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: currentUser.userId },
      select: { clientId: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    await prisma.client.update({
      where: { id: user.clientId },
      data: { trialEndedNoticeSeen: true },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[dismiss-trial-notice] Error:", error)
    return NextResponse.json({ error: "Failed to dismiss notice" }, { status: 500 })
  }
}
