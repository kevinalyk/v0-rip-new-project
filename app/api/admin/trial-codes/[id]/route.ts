import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// PATCH /api/admin/trial-codes/[id] — toggle a trial code's active state (deactivate/reactivate).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { active } = body

    if (typeof active !== "boolean") {
      return NextResponse.json({ error: "active must be a boolean" }, { status: 400 })
    }

    const updated = await prisma.trialCode.update({
      where: { id },
      data: { active },
    })

    return NextResponse.json({ code: updated })
  } catch (error) {
    console.error("[Admin] Failed to update trial code:", error)
    return NextResponse.json({ error: "Failed to update trial code" }, { status: 500 })
  }
}

// DELETE /api/admin/trial-codes/[id] — permanently remove a trial code (e.g. to re-create it
// with different settings before it expires). Any redemption rows cascade-delete via the schema
// relation; this does NOT touch trials already granted to clients (those live on the Client
// record independently), it only frees the code string for reuse and removes it from the list.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    await prisma.trialCode.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[Admin] Failed to delete trial code:", error)
    return NextResponse.json({ error: "Failed to delete trial code" }, { status: 500 })
  }
}
