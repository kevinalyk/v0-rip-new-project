import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, isSystemAdmin } from "@/lib/auth"

// PATCH endpoint to toggle seed email's locked status
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    console.log(`PATCH /api/seedlist/${params.id}/lock called`)

    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Only admins can toggle lock status
    const isUserAdmin = await isSystemAdmin(userId)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id: params.id },
      select: { locked: true, email: true, assignedToClient: true },
    })

    if (!seedEmail) {
      return NextResponse.json({ error: "Seed email not found" }, { status: 404 })
    }

    const body = await request.json()
    const { locked } = body

    if (typeof locked !== "boolean") {
      return NextResponse.json({ error: "locked must be a boolean" }, { status: 400 })
    }

    const updateData: { locked: boolean; assignedToClient?: string } = { locked }

    if (locked && !seedEmail.assignedToClient) {
      // Find the RIP client
      const ripClient = await prisma.client.findFirst({
        where: {
          OR: [{ slug: "rip" }, { name: { contains: "RIP", mode: "insensitive" } }],
        },
      })

      if (ripClient) {
        updateData.assignedToClient = ripClient.id
        console.log(
          `[v0] Assigning seed email ${params.id} to RIP client ${ripClient.id} because it's being locked with no client`,
        )
      }
    }

    // Update the seed email's locked status
    const updatedSeed = await prisma.seedEmail.update({
      where: { id: params.id },
      data: updateData,
    })

    console.log(`Seed email ${params.id} lock status updated to ${locked}`)
    return NextResponse.json(updatedSeed)
  } catch (error) {
    console.error("Error updating seed email lock status:", error)
    return NextResponse.json({ error: "Failed to update lock status" }, { status: 500 })
  }
}
