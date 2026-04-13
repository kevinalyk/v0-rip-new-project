import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clientSlug = request.nextUrl.searchParams.get("clientSlug")
    if (!clientSlug) {
      return NextResponse.json({ error: "clientSlug is required" }, { status: 400 })
    }

    // Get the client by slug
    const client = await prisma.client.findFirst({
      where: {
        OR: [
          { slug: clientSlug },
          { name: { equals: clientSlug, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    // Get assigned seed emails for this client
    const assignedSeeds = await prisma.seedEmail.findMany({
      where: {
        locked: true,
        active: true,
        OR: [
          { assignedToClient: client.id },
          { assignedToClient: client.name },
          { assignedToClient: { equals: client.name, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        email: true,
        provider: true,
      },
      orderBy: { email: "asc" },
    })

    // Filter out RIP seeds (shouldn't be in personal inbox)
    const filteredSeeds = assignedSeeds.filter(
      (seed) => !["rip", "RIP"].includes(seed.email.split("@")[0])
    )

    // Get assigned phone numbers for this client
    const assignedPhones = await prisma.personalPhoneNumber.findMany({
      where: {
        clientId: client.id,
      },
      select: {
        id: true,
        phoneNumber: true,
      },
      orderBy: { phoneNumber: "asc" },
    })

    return NextResponse.json({
      clientName: client.name,
      seeds: filteredSeeds,
      phoneNumbers: assignedPhones,
    })
  } catch (error) {
    console.error("Error fetching personal assignments:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
