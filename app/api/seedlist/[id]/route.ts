import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, isSystemAdmin } from "@/lib/auth"

// Delete a seed email - admin or owner only
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    console.log(`DELETE /api/seedlist/${params.id} called`)

    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const isUserAdmin = await isSystemAdmin(userId)

    if (!isUserAdmin) {
      // If not super admin, check if they own the seed email
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { clientId: true },
      })

      const seedEmail = await prisma.seedEmail.findUnique({
        where: { id: params.id },
        select: { ownedByClient: true },
      })

      if (!seedEmail) {
        return NextResponse.json({ error: "Seed email not found" }, { status: 404 })
      }

      // Check if user's client owns this seed email
      if (!userRecord?.clientId || seedEmail.ownedByClient !== userRecord.clientId) {
        return NextResponse.json({ error: "Forbidden - You can only delete seed emails you own" }, { status: 403 })
      }
    }

    await prisma.seedEmail.delete({
      where: { id: params.id },
    })

    console.log(`Seed email with ID ${params.id} deleted successfully`)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting seed email:", error)
    return NextResponse.json({ error: "Failed to delete seed email" }, { status: 500 })
  }
}

// PATCH endpoint to update seed email's assigned client
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    console.log(`PATCH /api/seedlist/${params.id} called`)

    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Only admins can reassign seed emails
    const isUserAdmin = await isSystemAdmin(userId)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id: params.id },
      select: { locked: true, ownedByClient: true, email: true },
    })

    if (!seedEmail) {
      return NextResponse.json({ error: "Seed email not found" }, { status: 404 })
    }

    if (seedEmail.locked) {
      return NextResponse.json(
        {
          error: "This seed email is locked to its owner and cannot be reassigned",
          ownedBy: seedEmail.ownedByClient,
        },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { assignedToClient } = body

    if (!assignedToClient) {
      return NextResponse.json({ error: "assignedToClient is required" }, { status: 400 })
    }

    // Update the seed email's assigned client
    const updatedSeed = await prisma.seedEmail.update({
      where: { id: params.id },
      data: { assignedToClient },
    })

    console.log(`Seed email ${params.id} assigned to client ${assignedToClient}`)
    return NextResponse.json(updatedSeed)
  } catch (error) {
    console.error("Error updating seed email:", error)
    return NextResponse.json({ error: "Failed to update seed email" }, { status: 500 })
  }
}
