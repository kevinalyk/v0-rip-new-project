import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { encrypt } from "@/lib/encryption"

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state") // This is our seedEmailId
    const error = searchParams.get("error")

    console.log("OAuth callback received:", { code: !!code, state, error })

    if (error) {
      console.error("OAuth error:", error)
      return NextResponse.redirect(
        `${process.env.MICROSOFT_REDIRECT_URI?.replace("/api/oauth/microsoft/callback", "")}/?error=oauth_error&details=${error}`,
      )
    }

    if (!code || !state) {
      console.error("Missing code or state:", { code: !!code, state })
      return NextResponse.redirect(
        `${process.env.MICROSOFT_REDIRECT_URI?.replace("/api/oauth/microsoft/callback", "")}/?error=missing_parameters`,
      )
    }

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET || !MICROSOFT_REDIRECT_URI) {
      console.error("Missing OAuth configuration")
      return NextResponse.redirect(
        `${process.env.MICROSOFT_REDIRECT_URI?.replace("/api/oauth/microsoft/callback", "")}/?error=oauth_not_configured`,
      )
    }

    // Verify the seedEmailId exists
    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id: state },
    })

    if (!seedEmail) {
      console.error("Seed email not found:", state)
      return NextResponse.redirect(
        `${process.env.MICROSOFT_REDIRECT_URI?.replace("/api/oauth/microsoft/callback", "")}/?error=invalid_seed_email`,
      )
    }

    console.log("Found seed email:", seedEmail.email)

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code: code,
        redirect_uri: MICROSOFT_REDIRECT_URI,
        grant_type: "authorization_code",
        scope: "Mail.ReadWrite openid profile offline_access",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Token exchange failed:", errorData)
      return NextResponse.redirect(
        `${process.env.MICROSOFT_REDIRECT_URI?.replace("/api/oauth/microsoft/callback", "")}/?error=token_exchange_failed`,
      )
    }

    const tokens = await tokenResponse.json()
    console.log("Received tokens:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
    })

    // Calculate token expiry (tokens.expires_in is in seconds)
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)
    console.log("Token expiry calculated:", tokenExpiry)

    // Encrypt the tokens before storing
    const encryptedAccessToken = encrypt(tokens.access_token)
    const encryptedRefreshToken = encrypt(tokens.refresh_token)
    console.log("Tokens encrypted successfully")

    // Update the seed email with OAuth tokens
    const updatedSeedEmail = await prisma.seedEmail.update({
      where: { id: state },
      data: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: tokenExpiry,
        oauthConnected: true,
        updatedAt: new Date(),
      },
    })

    console.log(`OAuth setup completed for seed email: ${seedEmail.email}`, {
      id: updatedSeedEmail.id,
      oauthConnected: updatedSeedEmail.oauthConnected,
      hasAccessToken: !!updatedSeedEmail.accessToken,
      hasRefreshToken: !!updatedSeedEmail.refreshToken,
      tokenExpiry: updatedSeedEmail.tokenExpiry,
    })

    // Redirect back to dashboard with success message
    return NextResponse.redirect(
      `${process.env.MICROSOFT_REDIRECT_URI?.replace("/api/oauth/microsoft/callback", "")}/?success=oauth_connected&email=${encodeURIComponent(seedEmail.email)}`,
    )
  } catch (error) {
    console.error("OAuth callback error:", error)
    return NextResponse.redirect(
      `${process.env.MICROSOFT_REDIRECT_URI?.replace("/api/oauth/microsoft/callback", "")}/?error=oauth_callback_failed`,
    )
  }
}
