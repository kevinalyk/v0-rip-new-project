import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { isAdmin } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    // Check if user is admin
    const isUserAdmin = await isAdmin(request)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 })
    }

    // Get queue statistics
    const totalEmails = await prisma.emailQueue.count()
    const processedEmails = await prisma.emailQueue.count({
      where: { processed: true },
    })
    const pendingEmails = await prisma.emailQueue.count({
      where: { processed: false },
    })
    const errorEmails = await prisma.emailQueue.count({
      where: {
        processed: false,
        processingAttempts: { gte: 3 },
      },
    })

    // Get recent emails
    const recentEmails = await prisma.emailQueue.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        processed: true,
        processingAttempts: true,
        error: true,
        createdAt: true,
        processedAt: true,
      },
    })

    return NextResponse.json({
      statistics: {
        total: totalEmails,
        processed: processedEmails,
        pending: pendingEmails,
        errors: errorEmails,
      },
      recentEmails,
    })
  } catch (error) {
    console.error("Error fetching email queue status:", error)
    return NextResponse.json({ error: "Failed to fetch queue status" }, { status: 500 })
  }
}
