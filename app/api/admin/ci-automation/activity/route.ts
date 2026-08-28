/**
 * GET /api/admin/ci-automation/activity
 * Lists CiApiActionLog rows (most recent first) for the admin "API Activity"
 * review tab. Super_admin only.
 */

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/ci-api-auth"

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 200)

  const logs = await prisma.ciApiActionLog.findMany({
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      apiKey: { select: { name: true, keyPrefix: true } },
    },
  })

  return NextResponse.json({ logs })
}
