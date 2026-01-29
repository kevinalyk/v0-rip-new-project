import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, isSystemAdmin } from "@/lib/auth"
import { canClientPerformWrites } from "@/lib/seed-utils"

// Get all domains that the user has access to
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

    const url = new URL(request.url)
    const clientSlug = url.searchParams.get("clientSlug")

    // Check if user is system admin
    const isUserAdmin = await isSystemAdmin(userId)

    let domains
    if (isUserAdmin) {
      const whereClause: any = {}

      if (clientSlug) {
        // Get the client ID from the slug
        const client = await prisma.client.findUnique({
          where: { slug: clientSlug },
          select: { id: true },
        })

        if (client) {
          whereClause.assignedToClientId = client.id
        }
      }

      // System admins can see all domains (or filtered by client)
      domains = await prisma.domain.findMany({
        where: whereClause,
        include: {
          _count: {
            select: {
              campaigns: true,
              userAccess: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      })
    } else {
      // Get user's client ID
      const userRecord = await prisma.user.findUnique({
        where: { id: userId },
        select: { clientId: true },
      })

      if (userRecord?.clientId) {
        // User has a client - show domains assigned to their client
        domains = await prisma.domain.findMany({
          where: {
            assignedToClientId: userRecord.clientId,
          },
          include: {
            _count: {
              select: {
                campaigns: true,
                userAccess: true,
              },
            },
          },
          orderBy: {
            name: "asc",
          },
        })
      } else {
        // Fallback to UserDomainAccess if no client assigned
        domains = await prisma.domain.findMany({
          where: {
            userAccess: {
              some: {
                userId: userId,
              },
            },
          },
          include: {
            userAccess: {
              where: {
                userId: userId,
              },
              select: {
                role: true,
              },
            },
            _count: {
              select: {
                campaigns: true,
                userAccess: true,
              },
            },
          },
          orderBy: {
            name: "asc",
          },
        })
      }
    }

    return NextResponse.json(domains)
  } catch (error) {
    console.error("Error fetching domains:", error)
    return NextResponse.json({ error: "Failed to fetch domains" }, { status: 500 })
  }
}

// Create a new domain (admin only)
export async function POST(request: Request) {
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

    // Only system admins can create domains
    const isUserAdmin = await isSystemAdmin(userId)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { clientId: true },
    })

    if (userRecord?.clientId && userRecord.clientId !== "RIP") {
      const canWrite = await canClientPerformWrites(userRecord.clientId)
      if (!canWrite) {
        return NextResponse.json(
          { error: "Your subscription is not active. Please reactivate to create domains." },
          { status: 403 },
        )
      }
    }

    const { name, domain, description } = await request.json()

    if (!name || !domain) {
      return NextResponse.json({ error: "Name and domain are required" }, { status: 400 })
    }

    // Create the domain
    const newDomain = await prisma.domain.create({
      data: {
        name,
        domain,
        description,
      },
    })

    return NextResponse.json(newDomain, { status: 201 })
  } catch (error: any) {
    console.error("Error creating domain:", error)

    if (error.code === "P2002") {
      return NextResponse.json({ error: "Domain name or domain already exists" }, { status: 409 })
    }

    return NextResponse.json({ error: "Failed to create domain" }, { status: 500 })
  }
}
