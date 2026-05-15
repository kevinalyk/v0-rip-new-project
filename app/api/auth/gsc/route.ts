import { redirect } from "next/navigation"
import { google } from "googleapis"

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GSC_CLIENT_ID,
    process.env.GSC_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"}/api/auth/gsc/callback`
  )
}

export async function GET() {
  const oauth2Client = getOAuthClient()

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/webmasters.readonly"],
  })

  redirect(url)
}
