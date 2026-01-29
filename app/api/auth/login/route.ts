import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"
import { createToken } from "@/lib/auth"

export async function POST(request: Request) {
  console.log("[v0] ========== LOGIN REQUEST START ==========")
  console.log("[v0] Request URL:", request.url)
  console.log("[v0] Request headers:", Object.fromEntries(request.headers.entries()))
  
  try {
    console.log("[v0] Step 1: Connecting to database...")
    await prisma.$connect()
    console.log("[v0] Step 1: Database connected successfully")

    console.log("[v0] Step 2: Parsing request body...")
    const { email, password } = await request.json()
    console.log("[v0] Step 2: Request body parsed. Email:", email)

    const normalizedEmail = email.toLowerCase()
    console.log("[v0] Step 3: Normalized email:", normalizedEmail)

    // Find the user with their client information
    console.log("[v0] Step 4: Querying database for user...")
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        client: {
          select: {
            id: true,
            slug: true,
          },
        },
      },
    })
    console.log("[v0] Step 4: User query complete. Found:", !!user)
    if (user) {
      console.log("[v0] Step 4: User details - ID:", user.id, "Role:", user.role, "ClientId:", user.clientId)
    }

    // Check if user exists
    if (!user) {
      console.log("[v0] Step 5: User not found - returning 401")
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Verify password
    console.log("[v0] Step 5: Verifying password...")
    const passwordMatch = await bcryptjs.compare(password, user.password)
    console.log("[v0] Step 5: Password verification result:", passwordMatch)
    if (!passwordMatch) {
      console.log("[v0] Step 6: Password mismatch - returning 401")
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    // Create JWT token with client information
    console.log("[v0] Step 6: Creating JWT token...")
    const tokenPayload = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      clientId: user.clientId,
      clientSlug: user.client?.slug || null,
    }
    console.log("[v0] Step 6: Token payload:", tokenPayload)
    const token = await createToken(tokenPayload)
    console.log("[v0] Step 6: Token created successfully. Length:", token.length)
    console.log("[v0] Step 6: Token preview:", token.substring(0, 50) + "...")

    // Create response
    console.log("[v0] Step 7: Creating response object...")
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        firstLogin: user.firstLogin,
      },
    })
    console.log("[v0] Step 7: Response object created")

    // Set cookie - don't specify domain to work in all environments
    console.log("[v0] Step 8: Setting auth_token cookie...")
    console.log("[v0] Step 8: Cookie settings - httpOnly: true, path: /, secure:", process.env.NODE_ENV === "production", "sameSite: lax")
    response.cookies.set({
      name: "auth_token",
      value: token,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 1 week
    })
    console.log("[v0] Step 8: Cookie set on response object")
    console.log("[v0] Step 8: Verifying cookie was added to response...")
    const setCookieHeaders = response.headers.getSetCookie()
    console.log("[v0] Step 8: Set-Cookie headers:", setCookieHeaders)

    // Update last active
    console.log("[v0] Step 9: Updating user lastActive timestamp...")
    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    })
    console.log("[v0] Step 9: User lastActive updated successfully")

    console.log("[v0] Step 10: Returning response with cookie")
    console.log("[v0] ========== LOGIN REQUEST SUCCESS ==========")
    return response
  } catch (error) {
    console.error("[v0] ========== LOGIN REQUEST FAILED ==========")
    console.error("[v0] Error details:", error)
    console.error("[v0] Error stack:", error instanceof Error ? error.stack : "No stack trace")
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  } finally {
    console.log("[v0] Step 11: Disconnecting from database...")
    await prisma.$disconnect()
    console.log("[v0] Step 11: Database disconnected")
  }
}
