import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    console.log("Reset password endpoint called")

    // Get the current user from the token
    const currentUser = (await getCurrentUser()) as any
    console.log("Current user from token:", currentUser)

    // Get the request body
    const { newPassword, email, token } = await request.json()
    console.log("Reset password request - email:", email, "has token:", !!token)

    if (token) {
      console.log("Processing token-based password reset")

      const resetToken = await prisma.$queryRaw<
        Array<{
          id: string
          token: string
          userId: string
          expiresAt: Date
          used: boolean
        }>
      >`
        SELECT id, token, "userId", "expiresAt", used
        FROM "PasswordResetToken"
        WHERE token = ${token}
          AND used = false
          AND "expiresAt" > NOW()
        LIMIT 1
      `

      if (!resetToken || resetToken.length === 0) {
        console.log("Invalid or expired token")
        return NextResponse.json({ error: "Invalid or expired reset link. Please request a new one." }, { status: 400 })
      }

      const tokenData = resetToken[0]
      console.log("Valid token found for userId:", tokenData.userId)

      // Hash the new password
      const hashedPassword = await bcryptjs.hash(newPassword, 10)

      // Update the user's password
      await prisma.user.update({
        where: { id: tokenData.userId },
        data: {
          password: hashedPassword,
          firstLogin: false,
        },
      })

      await prisma.$executeRaw`
        UPDATE "PasswordResetToken"
        SET used = true
        WHERE id = ${tokenData.id}
      `

      console.log("Password reset successful via token")
      return NextResponse.json({ success: true })
    }

    // If we have a token with userId, use that
    if (currentUser && currentUser.userId) {
      console.log("Using userId from token:", currentUser.userId)

      // Hash the new password
      const hashedPassword = await bcryptjs.hash(newPassword, 10)

      // Update the user's password
      await prisma.user.update({
        where: { id: currentUser.userId },
        data: {
          password: hashedPassword,
          firstLogin: false,
        },
      })

      return NextResponse.json({ success: true })
    }
    // If no token but email is provided, try to find the user by email
    else if (email) {
      console.log("No token, using email:", email)

      // Find the user by email
      const user = await prisma.user.findUnique({
        where: { email },
      })

      if (!user) {
        console.log("User not found for email:", email)
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }

      if (!user.firstLogin) {
        console.log("Not first login for user:", email)
        return NextResponse.json({ error: "Password reset not allowed" }, { status: 403 })
      }

      // Hash the new password
      const hashedPassword = await bcryptjs.hash(newPassword, 10)

      // Update the user's password
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          firstLogin: false,
        },
      })

      return NextResponse.json({ success: true })
    }

    console.log("No user identification provided")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  } catch (error) {
    console.error("Password reset error:", error)
    return NextResponse.json({ error: "Password reset failed" }, { status: 500 })
  }
}
