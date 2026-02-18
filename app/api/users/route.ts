import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, isSystemAdmin } from "@/lib/auth"
import { canClientPerformWrites } from "@/lib/seed-utils"
import { canAddMoreUsers } from "@/lib/subscription-utils"
import { updateClientUserSeats } from "@/lib/stripe-user-seats"

// Get all users (authenticated users can view)
export async function GET(request: Request) {
  try {
    console.log("=== GET /api/users ===")

    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    console.log("Authenticated user:", user)

    if (!user) {
      console.log("No authenticated user found")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Handle both userId and id fields from JWT
    const userId = user.userId || user.id
    console.log("Using userId:", userId)

    if (!userId) {
      console.log("No userId found in token")
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clientId: true },
    })

    const isSuperAdmin = userRecord?.role === "super_admin"
    console.log("Is super admin:", isSuperAdmin)

    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get("clientSlug")

    // Super admins see all users, regular users see only users from their client
    const whereClause: any = {}

    if (clientSlug && clientSlug.toLowerCase() !== "rip") {
      const client = await prisma.client.findUnique({
        where: { slug: clientSlug },
        select: { id: true },
      })

      if (client) {
        whereClause.clientId = client.id
        console.log("Filtering users by client slug:", clientSlug, "clientId:", client.id)
      }
    } else if (clientSlug && clientSlug.toLowerCase() === "rip" && isSuperAdmin) {
      // Super admin viewing RIP - show ALL users across all clients
      console.log("Super admin viewing RIP - showing all users across all clients")
      // No filter - whereClause remains empty
    } else if (!isSuperAdmin && userRecord?.clientId) {
      // Regular users can only see users from their own client
      whereClause.clientId = userRecord.clientId
      console.log("Filtering users by user's clientId:", userRecord.clientId)
    }

    // Get all users with domain access
    const users = await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        lastActive: true,
        firstLogin: true,
        clientId: true,
        createdAt: true,
        domainAccess: {
          include: {
            domain: {
              select: {
                id: true,
                name: true,
                domain: true,
              },
            },
          },
        },
      },
      orderBy: { email: "asc" },
    })

    console.log("Found users:", users.length)
    return NextResponse.json(users)
  } catch (error) {
    console.error("Error fetching users:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch users",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// Create a new user (admin only)
export async function POST(request: Request) {
  try {
    // Check if user is admin
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
          { error: "Your subscription is not active. Please reactivate to add users." },
          { status: 403 },
        )
      }

      const client = await prisma.client.findUnique({
        where: { id: userRecord.clientId },
        select: {
          subscriptionPlan: true,
          userSeatsIncluded: true,
          additionalUserSeats: true,
        },
      })

      if (client) {
        const currentUserCount = await prisma.user.count({
          where: { clientId: userRecord.clientId },
        })

        const canAdd = canAddMoreUsers(
          client.subscriptionPlan as any,
          currentUserCount,
          client.userSeatsIncluded || 0,
          client.additionalUserSeats || 0,
        )

        if (!canAdd) {
          const totalLimit = (client.userSeatsIncluded || 0) + (client.additionalUserSeats || 0)
          return NextResponse.json(
            {
              error: `User limit reached. Your plan includes ${totalLimit} user${totalLimit > 1 ? "s" : ""}. Please contact support to add more user seats at $50/month each.`,
            },
            { status: 403 },
          )
        }
      }
    }

    const { email, firstName, lastName, password, role, domainIds, domainRole } = await request.json()

    // Validate required fields
    if (!email || !firstName) {
      return NextResponse.json({ error: "Email and firstName are required" }, { status: 400 })
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json({ error: "User already exists" }, { status: 400 })
    }

    // Hash the password
    const hashedPassword = await bcryptjs.hash(password || "Temp123!", 10)

    // Create the user
    const newUser = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName: lastName || "",
        role: role || "viewer",
        password: hashedPassword,
        firstLogin: true,
      },
    })

    // Add domain access if provided
    if (domainIds && Array.isArray(domainIds) && domainIds.length > 0) {
      await prisma.userDomainAccess.createMany({
        data: domainIds.map((domainId: string) => ({
          userId: newUser.id,
          domainId,
          role: domainRole || "viewer",
        })),
      })
    }

    if (userRecord?.clientId && userRecord.clientId !== "RIP") {
      try {
        await updateClientUserSeats(userRecord.clientId)
      } catch (error) {
        console.error("[v0] Failed to update user seats in Stripe:", error)
        // Don't fail the user creation if Stripe update fails
      }
    }

    // Fetch the user with domain access to return
    const userWithDomains = await prisma.user.findUnique({
      where: { id: newUser.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        domainAccess: {
          include: {
            domain: {
              select: {
                id: true,
                name: true,
                domain: true,
              },
            },
          },
        },
      },
    })

    return NextResponse.json(userWithDomains, { status: 201 })
  } catch (error) {
    console.error("Error creating user:", error)
    return NextResponse.json(
      {
        error: "Failed to create user",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
