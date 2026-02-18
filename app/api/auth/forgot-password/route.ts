import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendPasswordResetEmail } from "@/lib/mailgun"
import { randomBytes } from "crypto"

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 })
    }

    console.log("Password reset requested for:", email)

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    // Always return success to prevent email enumeration
    // But only send email if user exists
    if (user) {
      // Generate secure random token
      const token = randomBytes(32).toString("hex")

      // Set expiration to 1 hour from now
      const expiresAt = new Date()
      expiresAt.setHours(expiresAt.getHours() + 1)

      // Store token in database using raw SQL
      await prisma.$executeRaw`
        INSERT INTO "PasswordResetToken" (id, token, "userId", "expiresAt", used, "createdAt")
        VALUES (${randomBytes(16).toString("hex")}, ${token}, ${user.id}, ${expiresAt}, false, NOW())
      `

      // Send password reset email
      const emailSent = await sendPasswordResetEmail(email, token)

      if (!emailSent) {
        console.error("Failed to send password reset email")
        // Still return success to user to prevent enumeration
      } else {
        console.log("Password reset email sent successfully to:", email)
      }
    } else {
      console.log("User not found for email:", email)
      // Still return success to prevent email enumeration
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists with that email, a password reset link has been sent.",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    return NextResponse.json({ error: "Failed to process request" }, { status: 500 })
  }
}
