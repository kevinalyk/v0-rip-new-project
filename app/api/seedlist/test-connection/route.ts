import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { decrypt } from "@/lib/encryption"
import { testImapConnection } from "@/lib/email-connection"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    console.log("🔍 === STARTING CONNECTION TEST API ===")

    // Check if user is authenticated
    const isAuth = await isAuthenticated(request)
    if (!isAuth) {
      console.log("❌ User not authenticated")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("✅ User authenticated")

    // Get the request body
    const { id, email, provider } = await request.json()
    console.log("📋 Request parameters:", { id, email, provider })

    if (!id || !email || !provider) {
      console.log("❌ Missing required parameters")
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 })
    }

    // Get the seed email from the database to retrieve the password
    console.log("🔍 Looking up seed email in database...")
    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id },
    })

    if (!seedEmail) {
      console.log("❌ Seed email not found in database")
      return NextResponse.json({ error: "Seed email not found" }, { status: 404 })
    }

    console.log("✅ Seed email found:", {
      id: seedEmail.id,
      email: seedEmail.email,
      provider: seedEmail.provider,
      twoFactorEnabled: seedEmail.twoFactorEnabled,
      hasAppPassword: !!seedEmail.appPassword,
      createdAt: seedEmail.createdAt,
    })

    // Decrypt the password
    console.log("🔓 Decrypting password...")
    const password =
      seedEmail.twoFactorEnabled && seedEmail.appPassword ? decrypt(seedEmail.appPassword) : decrypt(seedEmail.password)

    console.log("✅ Password decrypted successfully")
    console.log(
      "🔑 Using password type:",
      seedEmail.twoFactorEnabled && seedEmail.appPassword ? "App Password" : "Regular Password",
    )
    console.log("🔑 Password length:", password.length)
    console.log("🔑 Password preview:", password.substring(0, 3) + "..." + password.substring(password.length - 3))

    // Test the IMAP connection
    console.log("🧪 Starting IMAP connection test...")
    const result = await testImapConnection(email, password, provider)

    console.log("🏁 Connection test completed:", {
      success: result.success,
      hasError: !!result.error,
      hasMessage: !!result.message,
    })

    if (result.success) {
      console.log("🎉 Connection test SUCCESSFUL!")
    } else {
      console.log("❌ Connection test FAILED:", result.error)
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("💥 Error in connection test API:", error)
    console.error("💥 Error type:", typeof error)
    console.error("💥 Error constructor:", error?.constructor?.name)
    console.error("💥 Error message:", error instanceof Error ? error.message : String(error))
    console.error("💥 Error stack:", error instanceof Error ? error.stack : "No stack trace")

    return NextResponse.json(
      {
        error: "Failed to test connection",
        details: error instanceof Error ? error.message : String(error),
        errorType: error?.constructor?.name,
      },
      { status: 500 },
    )
  }
}
