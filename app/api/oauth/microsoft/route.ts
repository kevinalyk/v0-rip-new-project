import { type NextRequest, NextResponse } from "next/server"

// Microsoft OAuth configuration
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI
const SCOPES = ["Mail.ReadWrite", "openid", "profile", "offline_access"]

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const seedEmailId = searchParams.get("seedEmailId")

    if (!seedEmailId) {
      return NextResponse.json({ error: "seedEmailId parameter is required" }, { status: 400 })
    }

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_REDIRECT_URI) {
      return NextResponse.json({ error: "Microsoft OAuth not configured" }, { status: 500 })
    }

    // Build the Microsoft OAuth URL
    const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize")
    authUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID)
    authUrl.searchParams.set("response_type", "code")
    authUrl.searchParams.set("redirect_uri", MICROSOFT_REDIRECT_URI)
    authUrl.searchParams.set("scope", SCOPES.join(" "))
    authUrl.searchParams.set("response_mode", "query")
    authUrl.searchParams.set("state", seedEmailId) // Pass seedEmailId as state

    // Redirect to Microsoft OAuth
    return NextResponse.redirect(authUrl.toString())
  } catch (error) {
    console.error("Error initiating Microsoft OAuth:", error)
    return NextResponse.json({ error: "Failed to initiate OAuth" }, { status: 500 })
  }
}
