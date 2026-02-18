import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, isSystemAdmin } from "@/lib/auth"

// Get a specific client by ID
export async function GET(request: Request, { params }: { params: { clientId: string } }) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const { clientId } = params

    // Check if user is system admin or belongs to this client
    const isUserAdmin = await isSystemAdmin(userId)

    if (!isUserAdmin) {
      // Check if user belongs to this client
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { clientId: true },
      })

      if (userRecord?.clientId !== clientId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        _count: {
          select: {
            users: true,
            domains: true,
            campaigns: true,
          },
        },
      },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    return NextResponse.json(client)
  } catch (error) {
    console.error("Error fetching client:", error)
    return NextResponse.json({ error: "Failed to fetch client" }, { status: 500 })
  }
}
