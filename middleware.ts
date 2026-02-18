import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifyToken } from "./lib/auth"

// This function must be marked `async` since we're using async JWT verification
export async function middleware(request: NextRequest) {
  console.log("[v0] ========== MIDDLEWARE START ==========")
  console.log("[v0] Middleware: Request path:", request.nextUrl.pathname)
  console.log("[v0] Middleware: Request URL:", request.url)
  console.log("[v0] Middleware: Request method:", request.method)

  // Skip middleware for static assets, API routes, and health check
  if (
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/images") ||
    request.nextUrl.pathname === "/favicon.ico" ||
    request.nextUrl.pathname === "/favicon.png" ||
    request.nextUrl.pathname === "/api/health" ||
    request.nextUrl.pathname === "/api/auth/me" ||
    request.nextUrl.pathname.startsWith("/api/auth/login") ||
    request.nextUrl.pathname.startsWith("/api/auth/signup") ||
    request.nextUrl.pathname.startsWith("/api/auth/logout") ||
    request.nextUrl.pathname.startsWith("/api/auth/reset-password") ||
    request.nextUrl.pathname.startsWith("/api/auth/forgot-password") ||
    request.nextUrl.pathname.startsWith("/api/auth/validate-invitation") ||
    request.nextUrl.pathname.startsWith("/api/auth/set-password") ||
    request.nextUrl.pathname.startsWith("/api/share/")
  ) {
    console.log("[v0] Middleware: Path is in skip list, allowing through")
    return NextResponse.next()
  }

  // Skip auth check for login, signup, reset-password, set-password, and share pages
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/signup" ||
    request.nextUrl.pathname === "/reset-password" ||
    request.nextUrl.pathname === "/set-password" ||
    request.nextUrl.pathname === "/testpage" ||
    request.nextUrl.pathname.startsWith("/share/")
  ) {
    return NextResponse.next()
  }

  if (request.nextUrl.pathname.startsWith("/api/webhooks/")) {
    console.log("Webhook endpoint detected, bypassing auth check")
    return NextResponse.next()
  }

  // Skip auth check for CRON jobs - they use Authorization header with CRON_SECRET
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    console.log("CRON job detected, bypassing cookie auth check")
    return NextResponse.next()
  }

  // Check for auth cookie
  console.log("[v0] Middleware: Checking for auth_token cookie...")
  console.log("[v0] Middleware: All cookies:", request.cookies.getAll().map(c => c.name).join(", "))
  const token = request.cookies.get("auth_token")?.value
  console.log("[v0] Middleware: auth_token cookie:", token ? `Found (length: ${token.length})` : "NOT FOUND")
  if (token) {
    console.log("[v0] Middleware: Token preview:", token.substring(0, 50) + "...")
  }

  if (token) {
    console.log("[v0] Middleware: Token found, verifying...")
    try {
      const payload = await verifyToken(token)
      console.log("[v0] Middleware: Token verification result:", payload ? "VALID" : "INVALID")
      if (payload) {
        console.log("[v0] Middleware: Payload details:", payload)
        console.log("[v0] Middleware: Valid token found, allowing access to:", request.nextUrl.pathname)

        const userRole = payload.role as string
        const clientSlug = payload.clientSlug as string | null
        const isSuperAdmin = userRole === "super_admin"

        // For non-super-admin users, enforce client-based routing
        if (!isSuperAdmin && !request.nextUrl.pathname.startsWith("/api") && clientSlug) {
          const currentPath = request.nextUrl.pathname

          // Check if user is trying to access a different client's route
          const isAccessingDifferentClient =
            currentPath.startsWith("/") &&
            !currentPath.startsWith("/login") &&
            !currentPath.startsWith("/reset-password") &&
            !currentPath.startsWith("/signup") &&
            !currentPath.startsWith("/set-password") &&
            !currentPath.startsWith("/share/") &&
            !currentPath.startsWith(`/${clientSlug}`)

          // Redirect to their client's page if accessing unauthorized routes
          if (isAccessingDifferentClient) {
            console.log(`Redirecting ${userRole} user from ${currentPath} to /${clientSlug}`)
            return NextResponse.redirect(new URL(`/${clientSlug}`, request.url))
          }
        }

        // For /api/auth/me endpoint, we'll allow it with a valid token
        if (request.nextUrl.pathname === "/api/auth/me") {
          return NextResponse.next()
        }

        // For other paths, check if it's an API route
        if (request.nextUrl.pathname.startsWith("/api")) {
          return NextResponse.next()
        }

        // For page routes, allow access
        return NextResponse.next()
      }
    } catch (error) {
      console.error("[v0] Middleware: Error verifying token:", error)
      console.error("[v0] Middleware: Error details:", error instanceof Error ? error.message : "Unknown error")
    }
  } else {
    console.log("[v0] Middleware: No token found in cookies")
  }

  // If we reach here, the user is not authenticated
  console.log("[v0] Middleware: User is NOT authenticated")

  // For API routes, return 401
  if (request.nextUrl.pathname.startsWith("/api")) {
    console.log("[v0] Middleware: Blocking API access with 401:", request.nextUrl.pathname)
    console.log("[v0] ========== MIDDLEWARE END (401) ==========")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // For page routes, redirect to login
  console.log("[v0] Middleware: Redirecting to login from:", request.nextUrl.pathname)
  console.log("[v0] ========== MIDDLEWARE END (redirect) ==========")
  return NextResponse.redirect(new URL("/login", request.url))
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
