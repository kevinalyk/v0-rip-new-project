import { type NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// Blocks a user's account and, if we've seen an IP for them via SiteVisit tracking,
// locks that IP out too — so a blocked user can't just sign up again from the same
// connection under a new email. See prisma/schema.prisma BlockedIp for details on
// how sourceUserId is used to safely reverse this on unblock.
export async function POST(request: NextRequest, { params }: { params: { userId: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { userId } = params
    const body = await request.json().catch(() => ({}))
    const reason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (user.role === "super_admin") {
      return NextResponse.json({ error: "Cannot block a super admin account" }, { status: 400 })
    }

    // Find the most recent IP we've logged for this user (from SiteVisit tracking on
    // /api/auth/me) so we can block it alongside the account itself.
    const lastVisit = await prisma.siteVisit.findFirst({
      where: { userId, ip: { not: "unknown" } },
      orderBy: { createdAt: "desc" },
      select: { ip: true },
    })

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: userId },
        data: { blocked: true, blockedAt: new Date(), blockedReason: reason },
      })

      if (lastVisit?.ip) {
        await tx.blockedIp.upsert({
          where: { ipAddress: lastVisit.ip },
          update: { sourceUserId: userId, reason },
          create: { ipAddress: lastVisit.ip, sourceUserId: userId, reason },
        })
      }
    })

    return NextResponse.json({ success: true, blockedIp: lastVisit?.ip ?? null })
  } catch (error) {
    console.error("Error blocking user:", error)
    return NextResponse.json({ error: "Failed to block user" }, { status: 500 })
  }
}
