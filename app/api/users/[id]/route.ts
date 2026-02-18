import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, isSystemAdmin } from "@/lib/auth"
import { updateClientUserSeats } from "@/lib/stripe-user-seats"

// Get a specific user
export async function GET(request: Request, { params }: { params: { id: string } }) {
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

    const isUserAdmin = await isSystemAdmin(userId)

    // Users can only view their own profile unless they're admin
    if (!isUserAdmin && userId !== params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        lastActive: true,
        firstLogin: true,
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

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json(targetUser)
  } catch (error) {
    console.error("Error fetching user:", error)
    return NextResponse.json(
      {
        error: "Failed to fetch user",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// Update a user
export async function PUT(request: Request, { params }: { params: { id: string } }) {
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

    const isUserAdmin = await isSystemAdmin(userId)

    // Users can only update their own profile unless they're admin
    if (!isUserAdmin && userId !== params.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { email, firstName, lastName, role, password, domainAccess } = await request.json()

    if (role !== undefined && isUserAdmin) {
      // Get the current user's role
      const currentUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      })

      // Get the target user's current role
      const targetUser = await prisma.user.findUnique({
        where: { id: params.id },
        select: { role: true },
      })

      // Role hierarchy: super_admin > owner > admin > editor > viewer

      // Only super_admins can change other super_admin roles
      if (targetUser?.role === "super_admin" && currentUser?.role !== "super_admin") {
        return NextResponse.json(
          { error: "Forbidden - Only super admins can change super admin roles" },
          { status: 403 },
        )
      }

      // Only super_admins can promote users to super_admin
      if (role === "super_admin" && currentUser?.role !== "super_admin") {
        return NextResponse.json(
          { error: "Forbidden - Only super admins can promote users to super admin" },
          { status: 403 },
        )
      }

      // Only super_admins can change owner roles
      if (targetUser?.role === "owner" && currentUser?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden - Only super admins can change owner roles" }, { status: 403 })
      }

      // Only super_admins can promote users to owner
      if (role === "owner" && currentUser?.role !== "super_admin") {
        return NextResponse.json({ error: "Forbidden - Only super admins can promote users to owner" }, { status: 403 })
      }

      // Owners can manage admin and user roles
      // Regular admins can only manage user roles (not promote to admin)
      if (currentUser?.role === "admin") {
        // Admins cannot change owner, super_admin, or other admin roles
        if (targetUser?.role === "admin" || targetUser?.role === "owner" || targetUser?.role === "super_admin") {
          return NextResponse.json(
            { error: "Forbidden - Admins cannot change admin, owner, or super admin roles" },
            { status: 403 },
          )
        }
        // Admins cannot promote users to admin
        if (role === "admin") {
          return NextResponse.json(
            { error: "Forbidden - Only owners and super admins can promote users to admin" },
            { status: 403 },
          )
        }
      }
    }

    // Prepare update data
    const updateData: any = {}
    if (email !== undefined) updateData.email = email
    if (firstName !== undefined) updateData.firstName = firstName
    if (lastName !== undefined) updateData.lastName = lastName

    // Only admins can change roles (with restrictions above)
    if (role !== undefined && isUserAdmin) {
      updateData.role = role
    }

    // Hash new password if provided
    if (password) {
      updateData.password = await bcryptjs.hash(password, 10)
      updateData.firstLogin = false
    }

    // Update user
    await prisma.user.update({
      where: { id: params.id },
      data: updateData,
    })

    // Update domain access if provided and user is admin
    if (domainAccess && Array.isArray(domainAccess) && isUserAdmin) {
      // Remove existing domain access
      await prisma.userDomainAccess.deleteMany({
        where: { userId: params.id },
      })

      // Add new domain access
      if (domainAccess.length > 0) {
        await prisma.userDomainAccess.createMany({
          data: domainAccess.map((access: any) => ({
            userId: params.id,
            domainId: access.domainId,
            role: access.role || "viewer",
          })),
        })
      }
    }

    // Return updated user with domain access
    const userWithDomains = await prisma.user.findUnique({
      where: { id: params.id },
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

    return NextResponse.json(userWithDomains)
  } catch (error) {
    console.error("Error updating user:", error)
    return NextResponse.json(
      {
        error: "Failed to update user",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}

// Delete a user (admin only)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
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

    // Don't allow users to delete themselves
    if (userId === params.id) {
      return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })
    }

    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })

    const targetUser = await prisma.user.findUnique({
      where: { id: params.id },
      select: { role: true },
    })

    // Only super_admins can delete owners
    if (targetUser?.role === "owner" && currentUser?.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Only super admins can delete owner users" }, { status: 403 })
    }

    // Regular admins cannot delete other admins, owners, or super_admins
    if (
      currentUser?.role === "admin" &&
      (targetUser?.role === "admin" || targetUser?.role === "owner" || targetUser?.role === "super_admin")
    ) {
      return NextResponse.json(
        { error: "Forbidden - Admins cannot delete admin, owner, or super admin users" },
        { status: 403 },
      )
    }

    // Owners can delete admins and users, but not other owners or super_admins
    if (currentUser?.role === "owner" && (targetUser?.role === "owner" || targetUser?.role === "super_admin")) {
      return NextResponse.json(
        { error: "Forbidden - Owners cannot delete other owners or super admins" },
        { status: 403 },
      )
    }

    const targetUserData = await prisma.user.findUnique({
      where: { id: params.id },
      select: { clientId: true },
    })

    // Delete user domain access first (due to foreign key constraints)
    await prisma.userDomainAccess.deleteMany({
      where: { userId: params.id },
    })

    // Delete the user
    await prisma.user.delete({
      where: { id: params.id },
    })

    if (targetUserData?.clientId && targetUserData.clientId !== "RIP") {
      try {
        await updateClientUserSeats(targetUserData.clientId)
      } catch (error) {
        console.error("[v0] Failed to update user seats in Stripe after deletion:", error)
        // Don't fail the deletion if Stripe update fails
      }
    }

    return NextResponse.json({ message: "User deleted successfully" })
  } catch (error) {
    console.error("Error deleting user:", error)
    return NextResponse.json(
      {
        error: "Failed to delete user",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
