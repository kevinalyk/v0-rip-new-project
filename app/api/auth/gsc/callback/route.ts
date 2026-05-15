import { NextRequest, NextResponse } from "next/server"
import { google } from "googleapis"

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GSC_CLIENT_ID,
    process.env.GSC_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"}/api/auth/gsc/callback`
  )
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 })
  }

  const oauth2Client = getOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)

  // Return the refresh token so you can add it to your env vars
  return NextResponse.json({
    message: "Success! Copy the refresh_token below and add it as GSC_REFRESH_TOKEN in your Vercel env vars.",
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
  })
}
