import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma" // Declare the prisma variable

// Get JWT secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this-in-production"
// Convert the secret to a Uint8Array for jose
const secretKey = new TextEncoder().encode(JWT_SECRET)

// Function to create a JWT token
export async function createToken(payload: any, expiresIn = "7d") {
  console.log("[v0] createToken called with payload:", payload)
  console.log("[v0] createToken expiresIn:", expiresIn)
  console.log("[v0] createToken JWT_SECRET exists:", !!JWT_SECRET)
  console.log("[v0] createToken JWT_SECRET length:", JWT_SECRET.length)
  
  try {
    console.log("[v0] createToken: Creating SignJWT...")
    const jwt = await new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(secretKey)

    console.log("[v0] createToken: Token created successfully")
    console.log("[v0] createToken: Token length:", jwt.length)
    return jwt
  } catch (error) {
    console.error("[v0] createToken: Error creating token:", error)
    throw error
  }
}

// Function to verify a JWT token
export async function verifyToken(token: string) {
  console.log("[v0] verifyToken called")
  console.log("[v0] verifyToken: Token length:", token.length)
  console.log("[v0] verifyToken: Token preview:", token.substring(0, 50) + "...")
  console.log("[v0] verifyToken: JWT_SECRET exists:", !!JWT_SECRET)
  
  try {
    console.log("[v0] verifyToken: Calling jwtVerify...")
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    })
    console.log("[v0] verifyToken: Token verified successfully")
    console.log("[v0] verifyToken: Payload:", payload)
    return payload
  } catch (error) {
    console.error("[v0] verifyToken: Token verification FAILED")
    console.error("[v0] verifyToken: Error:", error)
    console.error("[v0] verifyToken: Error message:", error instanceof Error ? error.message : "Unknown error")
    return null
  }
}

// Function to get the current user from the token in cookies
export async function getCurrentUser() {
  const cookieStore = cookies()
  console.log("[v0] Getting cookies from cookieStore")
  const token = cookieStore.get("auth_token")?.value

  if (!token) {
    console.log("[v0] No auth_token cookie found in cookieStore")
    // Log all available cookies for debugging
    const allCookies = cookieStore.getAll()
    console.log("[v0] Available cookies:", allCookies.map(c => c.name).join(", "))
    return null
  }

  console.log("[v0] Found auth_token, length:", token.length)
  try {
    return await verifyToken(token)
  } catch (error) {
    console.error("[v0] Error getting current user:", error)
    return null
  }
}

// Function to get the session (alias for getCurrentUser for compatibility)
export async function getSession() {
  return getCurrentUser()
}

export async function getServerSession() {
  const user = await getCurrentUser()
  if (!user) return null

  return {
    user: {
      id: user.userId || user.id,
      email: user.email,
      role: user.role,
    },
  }
}

/**
 * Get RIP employee with their client domain access
 */
export async function getUserWithDomains(userId: string) {
  try {
    const prisma = (await import("@/lib/prisma")).default
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        domainAccess: {
          include: {
            domain: true,
          },
        },
      },
    })
    return user
  } catch (error) {
    console.error("Error fetching user with domains:", error)
    return null
  }
}

/**
 * Check if a RIP employee has access to monitor a specific client domain
 */
export async function hasAccessToDomain(userId: string, domainId: string, requiredRole?: string) {
  try {
    const prisma = (await import("@/lib/prisma")).default
    const access = await prisma.userDomainAccess.findFirst({
      where: {
        userId,
        domainId,
        ...(requiredRole && { role: requiredRole }),
      },
    })
    return !!access
  } catch (error) {
    console.error("Error checking domain access:", error)
    return false
  }
}

/**
 * Check if a RIP employee is a system admin
 * This checks both the legacy User.role field and the new UserDomainAccess system
 */
export async function isSystemAdmin(userId: string) {
  try {
    const prisma = (await import("@/lib/prisma")).default
    console.log("Checking system admin for userId:", userId)

    // First check legacy User.role field
    const user = await prisma.user.findUnique({
      where: { id: userId },
    })

    console.log("Found user:", user)

    if (user?.role === "super_admin" || user?.role === "admin" || user?.role === "owner") {
      console.log("User is super_admin, admin, or owner via User.role")
      return true
    }

    // Also check if they have admin role in any client domain
    const adminAccess = await prisma.userDomainAccess.findFirst({
      where: {
        userId,
        role: "admin",
      },
    })

    console.log("Admin access found:", adminAccess)

    return !!adminAccess
  } catch (error) {
    console.error("Error checking system admin:", error)
    return false
  }
}

/**
 * Get all client domains that a RIP employee can monitor
 */
export async function getUserDomains(userId: string) {
  try {
    const prisma = (await import("@/lib/prisma")).default
    const domainAccess = await prisma.userDomainAccess.findMany({
      where: { userId },
      include: {
        domain: true,
      },
    })
    return domainAccess.map((access) => ({
      ...access.domain,
      role: access.role,
    }))
  } catch (error) {
    console.error("Error fetching user domains:", error)
    return []
  }
}

// Middleware to check if user is authenticated
export async function isAuthenticated(request: Request) {
  // Get token from Authorization header or cookies
  const authHeader = request.headers.get("Authorization")
  const token = authHeader ? authHeader.split(" ")[1] : null

  if (token) {
    const payload = await verifyToken(token)
    if (payload) {
      return true
    }
  }

  // Check for auth cookie in the request
  const cookieHeader = request.headers.get("cookie")
  if (cookieHeader) {
    const cookies = parseCookies(cookieHeader)
    const authToken = cookies["auth_token"]
    if (authToken) {
      const payload = await verifyToken(authToken)
      if (payload) {
        return true
      }
    }
  }

  return false
}

// Middleware to check if user has admin role (updated to check system admin)
export async function isAdmin(request: Request) {
  const user = await getAuthenticatedUser(request)
  if (!user) return false

  // Handle both userId and id fields from JWT
  const userId = user.userId || user.id
  if (!userId) return false

  return await isSystemAdmin(userId)
}

// Function to get authenticated user from request
export async function getAuthenticatedUser(request: Request) {
  // Get token from Authorization header or cookies
  const authHeader = request.headers.get("Authorization")
  let token = authHeader ? authHeader.split(" ")[1] : null

  // If no auth header, check cookies
  if (!token) {
    const cookieHeader = request.headers.get("cookie")
    if (cookieHeader) {
      const cookies = parseCookies(cookieHeader)
      token = cookies["auth_token"]
    }
  }

  if (!token) return null

  const payload = (await verifyToken(token)) as any
  if (!payload) return null

  // Handle both userId and id fields from JWT for backward compatibility
  const userId = payload.userId || payload.id
  if (userId) {
    payload.id = userId // Normalize to id field
  }

  return payload
}

/**
 * Verify authentication for API routes
 * Returns success status and user info
 */
export async function verifyAuth(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)

    if (!user) {
      return {
        success: false,
        error: "Unauthorized",
        user: null,
      }
    }

    return {
      success: true,
      user: user,
      error: null,
    }
  } catch (error) {
    console.error("Error verifying auth:", error)
    return {
      success: false,
      error: "Authentication failed",
      user: null,
    }
  }
}

// Helper function to parse cookies from header
function parseCookies(cookieHeader: string) {
  const cookies: Record<string, string> = {}
  cookieHeader.split(";").forEach((cookie) => {
    const [name, value] = cookie.trim().split("=")
    cookies[name] = decodeURIComponent(value)
  })
  return cookies
}
