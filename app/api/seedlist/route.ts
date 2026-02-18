import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        clientId: true,
      },
    })

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get("clientSlug")

    let seedEmails

    // If a specific client slug is provided, filter by that client (even for super_admins)
    if (clientSlug) {
      const client = await prisma.client.findUnique({
        where: { slug: clientSlug },
        select: { id: true, name: true },
      })

      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 })
      }

      seedEmails = await prisma.seedEmail.findMany({
        where: {
          assignedToClient: client.name,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          provider: true,
          createdAt: true,
          ownedByClient: true,
          assignedToClient: true,
          active: true,
          locked: true,
        },
      })
      console.log(
        `[v0] Filtered seed emails by client name: ${client.name} (slug: ${clientSlug}), found ${seedEmails.length} seeds`,
      )
    } else if (userRecord.role === "super_admin") {
      seedEmails = await prisma.seedEmail.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          provider: true,
          createdAt: true,
          ownedByClient: true,
          assignedToClient: true,
          active: true,
          locked: true,
        },
      })
    } else {
      if (!userRecord.clientId) {
        return NextResponse.json({ error: "User not assigned to a client" }, { status: 403 })
      }

      const userClient = await prisma.client.findUnique({
        where: { id: userRecord.clientId },
        select: { name: true },
      })

      if (!userClient) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 })
      }

      seedEmails = await prisma.seedEmail.findMany({
        where: {
          assignedToClient: userClient.name,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          provider: true,
          createdAt: true,
          ownedByClient: true,
          assignedToClient: true,
          active: true,
          locked: true,
        },
      })
      console.log(
        `[v0] Filtered seed emails for user's client name: ${userClient.name}, found ${seedEmails.length} seeds`,
      )
    }

    return NextResponse.json(seedEmails)
  } catch (error) {
    console.error("Error fetching seed emails:", error)
    return NextResponse.json({ error: "Failed to fetch seed emails" }, { status: 500 })
  }
}
