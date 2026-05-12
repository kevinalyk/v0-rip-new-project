import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const token = searchParams.get("token")
    const redirect = searchParams.get("redirect")

    if (!token || !redirect) {
      return NextResponse.json(
        { error: "Missing token or redirect parameter" },
        { status: 400 }
      )
    }

    // Decrypt token to get click metadata
    let clickData: any
    try {
      clickData = JSON.parse(decrypt(token))
    } catch (error) {
      console.error("[track/click] Invalid token:", error)
      // If token is invalid, just redirect without logging
      return NextResponse.redirect(new URL(redirect, request.url))
    }

    const { userId, emailType, linkType } = clickData
    const userAgent = request.headers.get("user-agent") || undefined

    // Log the click
    try {
      await prisma.emailClickEvent.create({
        data: {
          userId,
          emailType,
          linkType,
          destination: redirect,
          userAgent,
        },
      })
    } catch (dbError) {
      // Don't fail the redirect if logging fails
      console.error("[track/click] Failed to log click:", dbError)
    }

    // Redirect to the actual destination
    return NextResponse.redirect(new URL(redirect, request.url))
  } catch (error) {
    console.error("[track/click] Error:", error)
    // Fallback to home if something goes really wrong
    return NextResponse.redirect(new URL("/", request.url))
  }
}
