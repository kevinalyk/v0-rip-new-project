import prisma from "@/lib/prisma"
import { encrypt, decrypt } from "@/lib/encryption"

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET

interface TokenRefreshResult {
  success: boolean
  error?: string
}

export async function refreshMicrosoftToken(seedEmailId: string): Promise<TokenRefreshResult> {
  try {
    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id: seedEmailId },
    })

    if (!seedEmail || !seedEmail.refreshToken) {
      return { success: false, error: "No refresh token found" }
    }

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      return { success: false, error: "Microsoft OAuth not configured" }
    }

    // Decrypt the refresh token
    const refreshToken = decrypt(seedEmail.refreshToken)

    // Request new tokens with Mail.ReadWrite scope
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "Mail.ReadWrite openid profile offline_access",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error(`Token refresh failed for ${seedEmail.email}:`, errorData)

      // Mark as disconnected if refresh fails
      await prisma.seedEmail.update({
        where: { id: seedEmailId },
        data: { oauthConnected: false },
      })

      return { success: false, error: "Token refresh failed" }
    }

    const tokens = await tokenResponse.json()

    // Calculate new expiry
    const tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000)

    // Encrypt new tokens
    const encryptedAccessToken = encrypt(tokens.access_token)
    const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : seedEmail.refreshToken

    // Update database
    await prisma.seedEmail.update({
      where: { id: seedEmailId },
      data: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        tokenExpiry: tokenExpiry,
        oauthConnected: true,
        updatedAt: new Date(),
      },
    })

    console.log(`Token refreshed successfully for ${seedEmail.email}`)
    return { success: true }
  } catch (error) {
    console.error("Error refreshing Microsoft token:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function isTokenExpired(tokenExpiry: Date | null): boolean {
  if (!tokenExpiry) return true

  // Consider token expired if it expires within the next 5 minutes
  const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000)
  return tokenExpiry <= fiveMinutesFromNow
}

export async function getValidAccessToken(seedEmailId: string): Promise<string | null> {
  try {
    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id: seedEmailId },
    })

    if (!seedEmail || !seedEmail.accessToken || !seedEmail.oauthConnected) {
      return null
    }

    // Check if token needs refresh
    if (isTokenExpired(seedEmail.tokenExpiry)) {
      console.log(`Token expired for ${seedEmail.email}, attempting refresh...`)
      const refreshResult = await refreshMicrosoftToken(seedEmailId)

      if (!refreshResult.success) {
        console.error(`Failed to refresh token for ${seedEmail.email}:`, refreshResult.error)
        return null
      }

      // Get the updated token
      const updatedSeedEmail = await prisma.seedEmail.findUnique({
        where: { id: seedEmailId },
      })

      return updatedSeedEmail?.accessToken ? decrypt(updatedSeedEmail.accessToken) : null
    }

    // Token is still valid, decrypt and return
    return decrypt(seedEmail.accessToken)
  } catch (error) {
    console.error("Error getting valid access token:", error)
    return null
  }
}
