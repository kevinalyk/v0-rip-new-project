import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { del } from "@vercel/blob"

// PATCH — super_admin only
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { title, body, imageUrl } = await request.json()

    if (title !== undefined && !title?.trim()) {
      return NextResponse.json({ error: "Title cannot be empty" }, { status: 400 })
    }
    if (body !== undefined && !body?.trim()) {
      return NextResponse.json({ error: "Body cannot be empty" }, { status: 400 })
    }

    const existing = await prisma.announcement.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 })
    }

    // If image was replaced, delete the old one from Blob
    if (imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== imageUrl) {
      try {
        await del(existing.imageUrl)
      } catch {
        // Non-fatal — old image cleanup best-effort
      }
    }

    const updated = await prisma.announcement.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(body !== undefined && { body: body.trim() }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl || null }),
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating announcement:", error)
    return NextResponse.json({ error: "Failed to update announcement" }, { status: 500 })
  }
}

// DELETE — super_admin only
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const existing = await prisma.announcement.findUnique({ where: { id: params.id } })
    if (!existing) {
      return NextResponse.json({ error: "Announcement not found" }, { status: 404 })
    }

    // Delete image from Blob if present
    if (existing.imageUrl) {
      try {
        await del(existing.imageUrl)
      } catch {
        // Non-fatal
      }
    }

    await prisma.announcement.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting announcement:", error)
    return NextResponse.json({ error: "Failed to delete announcement" }, { status: 500 })
  }
}
