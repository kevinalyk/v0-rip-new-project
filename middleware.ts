import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { verifyToken } from "./lib/auth"

// This function must be marked `async` since we're using async JWT verification
export async function middleware(request: NextRequest) {
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
    request.nextUrl.pathname.startsWith("/api/share/") ||
    request.nextUrl.pathname.startsWith("/api/og/") ||
    request.nextUrl.pathname.startsWith("/api/announcements")
  ) {
    return NextResponse.next()
  }

  // Skip auth check for login, signup, reset-password, set-password, share pages, and public news
  if (
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/signup" ||
    request.nextUrl.pathname === "/reset-password" ||
    request.nextUrl.pathname === "/set-password" ||
    request.nextUrl.pathname === "/testpage" ||
    request.nextUrl.pathname.startsWith("/share/") ||
    request.nextUrl.pathname === "/news" ||
    request.nextUrl.pathname.startsWith("/news/")
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
  const token = request.cookies.get("auth_token")?.value

  if (token) {
    try {
      const payload = await verifyToken(token)
      if (payload) {

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
            !currentPath.startsWith("/news") &&
            !currentPath.startsWith(`/${clientSlug}`)

          // Redirect to their client's page if accessing unauthorized routes
          if (isAccessingDifferentClient) {
            return NextResponse.redirect(new URL(`/${clientSlug}`, request.url))
          }
        }

        if (request.nextUrl.pathname === "/api/auth/me") {
          return NextResponse.next()
        }

        if (request.nextUrl.pathname.startsWith("/api")) {
          return NextResponse.next()
        }

        return NextResponse.next()
      }
    } catch (error) {
      console.error("Middleware token verification error:", error instanceof Error ? error.message : error)
    }
  }

  // User is not authenticated
  if (request.nextUrl.pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  return NextResponse.redirect(new URL("/login", request.url))
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
}
