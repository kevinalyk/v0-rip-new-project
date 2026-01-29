import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    // Check environment variables
    const envCheck = {
      MICROSOFT_CLIENT_ID: !!process.env.MICROSOFT_CLIENT_ID,
      MICROSOFT_CLIENT_SECRET: !!process.env.MICROSOFT_CLIENT_SECRET,
      MICROSOFT_REDIRECT_URI: process.env.MICROSOFT_REDIRECT_URI,
      ENCRYPTION_KEY: !!process.env.ENCRYPTION_KEY,
      LEGACY_CLIENT_ID: !!process.env.CLIENT_ID,
      LEGACY_CLIENT_SECRET: !!process.env.CLIENT_SECRET,
      LEGACY_REDIRECT_URI: process.env.REDIRECT_URI,
    }

    // Check database schema
    const sampleSeedEmail = await prisma.seedEmail.findFirst({
      where: {
        OR: [{ provider: "outlook" }, { provider: "hotmail" }, { provider: "microsoft" }],
      },
      select: {
        id: true,
        email: true,
        provider: true,
        oauthConnected: true,
        accessToken: true,
        refreshToken: true,
        tokenExpiry: true,
      },
    })

    return NextResponse.json({
      status: "OAuth Setup Check",
      environment: envCheck,
      configurationStatus: {
        newImplementationReady: !!(
          process.env.MICROSOFT_CLIENT_ID &&
          process.env.MICROSOFT_CLIENT_SECRET &&
          process.env.MICROSOFT_REDIRECT_URI
        ),
        legacyVariablesPresent: !!(process.env.CLIENT_ID || process.env.CLIENT_SECRET || process.env.REDIRECT_URI),
        recommendedAction: !!(process.env.CLIENT_ID || process.env.CLIENT_SECRET || process.env.REDIRECT_URI)
          ? "Remove legacy environment variables (CLIENT_ID, CLIENT_SECRET, REDIRECT_URI) and ensure MICROSOFT_* variables are set"
          : "Configuration looks good - using new MICROSOFT_* variables",
      },
      database: {
        schemaUpdated: true,
        outlookAccountsFound: !!sampleSeedEmail,
        sampleAccount: sampleSeedEmail
          ? {
              id: sampleSeedEmail.id,
              email: sampleSeedEmail.email,
              provider: sampleSeedEmail.provider,
              oauthConnected: sampleSeedEmail.oauthConnected,
              hasTokens: !!(sampleSeedEmail.accessToken && sampleSeedEmail.refreshToken),
            }
          : null,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: "Error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
