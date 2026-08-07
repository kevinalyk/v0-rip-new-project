import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// DELETE /api/campaign-alerts/[id] — delete an alert (must belong to the current user)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const existing = await prisma.campaignAlertSubscription.findUnique({
    where: { id },
    select: { userId: true },
  })

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  if (existing.userId !== auth.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.campaignAlertSubscription.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
