import { NextResponse } from "next/server"
import { getAuthenticatedUser, isSystemAdmin, getUserWithDomains } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    console.log("=== DEBUG USER INFO ===")

    // Check raw token
    const authHeader = request.headers.get("Authorization")
    const cookieHeader = request.headers.get("cookie")

    console.log("Auth header:", authHeader ? "Present" : "Missing")
    console.log("Cookie header:", cookieHeader ? "Present" : "Missing")

    let token = null
    if (authHeader) {
      token = authHeader.split(" ")[1]
    } else if (cookieHeader) {
      const cookies = parseCookies(cookieHeader)
      token = cookies["auth_token"]
    }

    console.log("Token found:", token ? "Yes" : "No")
    console.log("Token preview:", token ? token.substring(0, 20) + "..." : "None")

    // Get authenticated user
    const user = await getAuthenticatedUser(request)
    console.log("Authenticated user:", user)

    if (!user) {
      return NextResponse.json({
        error: "No authenticated user found",
        debug: {
          hasAuthHeader: !!authHeader,
          hasCookieHeader: !!cookieHeader,
          hasToken: !!token,
          tokenPreview: token ? token.substring(0, 20) + "..." : null,
        },
      })
    }

    // Handle both userId and id fields
    const userId = user.userId || user.id
    console.log("Using userId:", userId)

    // Check if user is admin
    const isUserAdmin = await isSystemAdmin(userId)
    console.log("Is system admin:", isUserAdmin)

    // Get user with domains
    const userWithDomains = await getUserWithDomains(userId)
    console.log("User with domains:", userWithDomains)

    return NextResponse.json({
      user,
      userId,
      isSystemAdmin: isUserAdmin,
      userWithDomains,
      debug: {
        userId: userId,
        userEmail: user.email,
        hasToken: !!token,
        userRole: user.role,
      },
    })
  } catch (error) {
    console.error("Debug endpoint error:", error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
  }
}

// Helper function to parse cookies
function parseCookies(cookieHeader: string) {
  const cookies: Record<string, string> = {}
  cookieHeader.split(";").forEach((cookie) => {
    const [name, value] = cookie.trim().split("=")
    if (name && value) {
      cookies[name] = decodeURIComponent(value)
    }
  })
  return cookies
}
