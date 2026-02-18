import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"

export async function GET() {
  try {
    // Find all Outlook accounts with OAuth tokens
    const outlookAccounts = await prisma.seedEmail.findMany({
      where: {
        OR: [{ provider: "outlook" }, { provider: "hotmail" }, { provider: "microsoft" }],
      },
      select: {
        id: true,
        email: true,
        provider: true,
        oauthConnected: true,
        tokenExpiry: true,
        accessToken: true,
        refreshToken: true,
        updatedAt: true,
      },
    })

    const results = outlookAccounts.map((account) => {
      let accessTokenPreview = null
      let refreshTokenPreview = null

      try {
        if (account.accessToken) {
          const decrypted = decrypt(account.accessToken)
          accessTokenPreview = decrypted.substring(0, 20) + "..."
        }
        if (account.refreshToken) {
          const decrypted = decrypt(account.refreshToken)
          refreshTokenPreview = decrypted.substring(0, 20) + "..."
        }
      } catch (error) {
        accessTokenPreview = "DECRYPTION_ERROR"
        refreshTokenPreview = "DECRYPTION_ERROR"
      }

      return {
        id: account.id,
        email: account.email,
        provider: account.provider,
        oauthConnected: account.oauthConnected,
        tokenExpiry: account.tokenExpiry,
        hasAccessToken: !!account.accessToken,
        hasRefreshToken: !!account.refreshToken,
        accessTokenPreview,
        refreshTokenPreview,
        lastUpdated: account.updatedAt,
      }
    })

    return NextResponse.json({
      success: true,
      totalOutlookAccounts: outlookAccounts.length,
      connectedAccounts: outlookAccounts.filter((a) => a.oauthConnected).length,
      accounts: results,
    })
  } catch (error) {
    console.error("Error checking tokens:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    })
  }
}
