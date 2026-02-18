import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { verifyAuth } from "@/lib/auth"

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { success, user } = await verifyAuth(request)
    if (!success || !user || user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized - Super Admin only" }, { status: 403 })
    }

    const userId = params.id

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, firstName: true, lastName: true },
    })

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const currentYear = new Date().getFullYear()
    const tempPassword = `TempPassword${currentYear}!`

    const hashedPassword = await bcrypt.hash(tempPassword, 10)

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        firstLogin: true,
      },
    })

    const emailSent = await sendPasswordResetNotification(
      targetUser.email,
      `${targetUser.firstName} ${targetUser.lastName}`,
      tempPassword,
    )

    if (!emailSent) {
      console.error("Failed to send password reset notification email")
      // Continue anyway since password was changed
    }

    console.log(`Password force reset for user ${targetUser.email} by super admin ${user.email}`)

    return NextResponse.json({
      success: true,
      message: "Password reset successfully",
      temporaryPassword: tempPassword,
      email: targetUser.email,
    })
  } catch (error) {
    console.error("Force reset password error:", error)
    return NextResponse.json({ error: "Failed to reset password" }, { status: 500 })
  }
}

async function sendPasswordResetNotification(email: string, userName: string, tempPassword: string): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("Mailgun credentials not configured")
    return false
  }

  const baseUrl = process.env.NODE_ENV === "production" ? "https://app.rip-tool.com" : "http://localhost:3000"
  const loginUrl = `${baseUrl}/login`

  const formData = new FormData()
  formData.append("from", `RIP Tool <hello@${MAILGUN_DOMAIN}>`)
  formData.append("to", email)
  formData.append("subject", "Your Password Has Been Reset - RIP Tool")
  formData.append(
    "html",
    `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
          <h1 style="color: #856404; margin: 0 0 20px 0; font-size: 24px;">Your Password Was Reset</h1>
          <p style="margin: 0 0 20px 0; font-size: 16px;">
            Hi ${userName},
          </p>
          <p style="margin: 0 0 20px 0; font-size: 16px;">
            An administrator has reset your password for your RIP Tool account.
          </p>
          <div style="background-color: #fff; border-radius: 6px; padding: 20px; margin: 20px 0; border: 2px solid #dc2626;">
            <p style="margin: 0 0 10px 0; font-size: 14px; color: #666; font-weight: 600;">YOUR TEMPORARY PASSWORD:</p>
            <p style="margin: 0; font-size: 24px; font-weight: bold; color: #dc2626; font-family: monospace; letter-spacing: 1px;">
              ${tempPassword}
            </p>
          </div>
          <p style="margin: 20px 0; font-size: 16px;">
            <strong>Important:</strong> For security reasons, you will be required to change this temporary password to a new one when you log in.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${loginUrl}" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
              Log In Now
            </a>
          </div>
          <p style="margin: 20px 0 0 0; font-size: 14px; color: #666;">
            If you did not request this password reset, please contact your administrator immediately.
          </p>
        </div>
        <div style="text-align: center; font-size: 12px; color: #999; margin-top: 20px;">
          <p>Republican Inboxing Protocol</p>
          <p>Login URL: ${loginUrl}</p>
        </div>
      </body>
    </html>
  `,
  )
  formData.append(
    "text",
    `
Your Password Was Reset

Hi ${userName},

An administrator has reset your password for your RIP Tool account.

YOUR TEMPORARY PASSWORD: ${tempPassword}

IMPORTANT: For security reasons, you will be required to change this temporary password to a new one when you log in.

Log in here: ${loginUrl}

If you did not request this password reset, please contact your administrator immediately.

---
Republican Inboxing Protocol
  `,
  )

  try {
    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Mailgun API error:", response.status, errorText)
      return false
    }

    const result = await response.json()
    console.log("Password reset notification email sent successfully:", result.id)
    return true
  } catch (error) {
    console.error("Error sending password reset notification email:", error)
    return false
  }
}
