import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { testEmailConnection } from "@/lib/email-connection"
import { OutlookConnection } from "@/lib/outlook-connection"
import { decrypt } from "@/lib/encryption"
import { getValidAccessToken } from "@/lib/microsoft-oauth"

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[cron/check-seed-emails] Starting seed email health check...")

  const seedEmails = await prisma.seedEmail.findMany({
    where: { active: true },
    select: {
      id: true,
      email: true,
      provider: true,
      password: true,
      appPassword: true,
      twoFactorEnabled: true,
      accessToken: true,
      refreshToken: true,
      oauthConnected: true,
    },
  })

  console.log(`[cron/check-seed-emails] Checking ${seedEmails.length} active seed emails`)

  const results = {
    total: seedEmails.length,
    healthy: 0,
    unhealthy: 0,
    errors: [] as { email: string; provider: string; error: string }[],
  }

  for (const seedEmail of seedEmails) {
    try {
      let success = false
      let errorMessage = ""

      const provider = seedEmail.provider?.toLowerCase() ?? ""

      // Outlook/Hotmail: OAuth accounts use the Microsoft Graph API (getValidAccessToken),
      // password-based accounts fall back to the OutlookConnection IMAP/POP3 handler.
      if (provider === "outlook" || provider === "hotmail" || provider === "live") {
        if (seedEmail.oauthConnected) {
          // OAuth path: attempt to get (and if needed refresh) a valid access token via Graph API
          try {
            const token = await getValidAccessToken(seedEmail.id)
            if (token) {
              // Token is valid — confirm by hitting a lightweight Graph endpoint
              const res = await fetch("https://graph.microsoft.com/v1.0/me/mailfolders/inbox?$select=id", {
                headers: { Authorization: `Bearer ${token}` },
              })
              success = res.ok
              if (!success) {
                const body = await res.text()
                errorMessage = `Graph API returned ${res.status}: ${body.slice(0, 200)}`
              }
            } else {
              success = false
              errorMessage = "OAuth token refresh failed — account may need to re-authenticate"
            }
          } catch (err) {
            success = false
            errorMessage = err instanceof Error ? err.message : String(err)
          }
        } else {
          // Password / app-password path: use OutlookConnection IMAP/POP3
          try {
            const password =
              seedEmail.twoFactorEnabled && seedEmail.appPassword
                ? decrypt(seedEmail.appPassword)
                : decrypt(seedEmail.password)

            const outlook = new OutlookConnection(seedEmail.email, password)
            const result = await outlook.testConnection()
            success = result.success
            errorMessage = result.error ?? ""
          } catch (err) {
            success = false
            errorMessage = err instanceof Error ? err.message : String(err)
          }
        }
      } else {
        // Gmail, Yahoo, AOL, iCloud, and all others via standard IMAP
        const result = await testEmailConnection(seedEmail)
        success = result.success
        errorMessage = result.error ?? ""
      }

      if (success) {
        results.healthy++
        await prisma.seedEmail.update({
          where: { id: seedEmail.id },
          data: {
            lastImapCheck: new Date(),
            imapStatus: "connected",
          },
        })
        console.log(`[cron/check-seed-emails] ✓ ${seedEmail.email} (${provider})`)
      } else {
        results.unhealthy++
        results.errors.push({ email: seedEmail.email, provider, error: errorMessage })
        await prisma.seedEmail.update({
          where: { id: seedEmail.id },
          data: {
            lastImapCheck: new Date(),
            imapStatus: "error",
          },
        })
        console.log(`[cron/check-seed-emails] ✗ ${seedEmail.email} (${provider}): ${errorMessage}`)
      }
    } catch (err) {
      results.unhealthy++
      const errorMessage = err instanceof Error ? err.message : String(err)
      results.errors.push({ email: seedEmail.email, provider: seedEmail.provider ?? "unknown", error: errorMessage })
      console.log(`[cron/check-seed-emails] ✗ ${seedEmail.email}: unexpected error: ${errorMessage}`)

      try {
        await prisma.seedEmail.update({
          where: { id: seedEmail.id },
          data: {
            lastImapCheck: new Date(),
            imapStatus: "error",
          },
        })
      } catch (_) {}
    }
  }

  console.log(
    `[cron/check-seed-emails] Done — ${results.healthy} healthy, ${results.unhealthy} unhealthy out of ${results.total}`
  )

  if (results.unhealthy > 0) {
    console.log("[cron/check-seed-emails] Unhealthy emails:", results.errors)
  }

  return NextResponse.json(results)
}
