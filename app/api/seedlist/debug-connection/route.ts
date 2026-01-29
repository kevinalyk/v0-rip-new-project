import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { decrypt } from "@/lib/encryption"
import { testImapConnection } from "@/lib/email-connection"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    console.log("🔍 === DEBUGGING IMAP CONNECTION ===")

    // Check if user is authenticated
    const isAuth = await isAuthenticated(request)
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the request body
    const { id, email, provider } = await request.json()
    console.log(`📧 Email: ${email}`)
    console.log(`🏢 Provider: ${provider}`)

    if (!id || !email || !provider) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    // Get the seed email from the database
    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id },
    })

    if (!seedEmail) {
      return NextResponse.json({ error: "Seed email not found" }, { status: 404 })
    }

    // Decrypt the password
    const password =
      seedEmail.twoFactorEnabled && seedEmail.appPassword ? decrypt(seedEmail.appPassword) : decrypt(seedEmail.password)

    console.log(`🔑 Password length: ${password.length}`)
    console.log(`🔐 Using 2FA: ${seedEmail.twoFactorEnabled}`)
    console.log(`🔐 Has app password: ${!!seedEmail.appPassword}`)

    // Use the enhanced IMAP connection test with full logging
    console.log("📋 Starting enhanced IMAP connection test...")
    const result = await testImapConnection(email, password, provider)

    console.log("🏁 === DEBUG CONNECTION COMPLETED ===")
    console.log(`✅ Connection successful: ${result.success}`)

    if (result.success) {
      console.log("🎉 All connection steps completed successfully!")
    } else {
      console.log(`❌ Connection failed: ${result.error}`)
      console.log("❌ Error details:", result.details)
    }

    return NextResponse.json({
      success: result.success,
      message: result.message,
      error: result.error,
      details: result.details,
      debugInfo: {
        email,
        provider,
        passwordLength: password.length,
        twoFactorEnabled: seedEmail.twoFactorEnabled,
        hasAppPassword: !!seedEmail.appPassword,
      },
    })
  } catch (error) {
    console.error("💥 Error in debug connection:", error)
    return NextResponse.json(
      { error: "Failed to debug connection", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
