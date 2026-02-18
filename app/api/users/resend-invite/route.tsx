import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyToken } from "@/lib/auth"
import crypto from "crypto"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    // Verify admin is authenticated
    const token = request.cookies.get("auth_token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Verify user is admin
    const adminUser = await sql`
      SELECT role FROM "User" WHERE id = ${payload.userId}
    `

    if (!adminUser || adminUser.length === 0 || adminUser[0].role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { userId } = await request.json()

    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Get user details
    const user = await sql`
      SELECT id, email, "firstName", "firstLogin" FROM "User" WHERE id = ${userId}
    `

    if (!user || user.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Only resend if user hasn't completed first login
    if (!user[0].firstLogin) {
      return NextResponse.json({ error: "User has already set their password" }, { status: 400 })
    }

    // Invalidate old tokens
    await sql`
      UPDATE "UserInvitation"
      SET used = true
      WHERE userid = ${userId} AND used = false
    `

    // Generate new invitation token
    const invitationToken = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Store new invitation token
    await sql`
      INSERT INTO "UserInvitation" (token, userid, expiresat)
      VALUES (${invitationToken}, ${userId}, ${expiresAt})
    `

    // Send invitation email via Mailgun
    const invitationLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"}/set-password?token=${invitationToken}`

    const mailgunDomain = process.env.MAILGUN_DOMAIN!
    const mailgunApiKey = process.env.MAILGUN_API_KEY!

    const formData = new FormData()
    formData.append("from", `RIP Tool <hello@${mailgunDomain}>`)
    formData.append("to", user[0].email)
    formData.append("subject", "Reminder: Set your RIP Tool password")
    formData.append(
      "html",
      `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #0070f3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h2>Reminder: Set Your Password</h2>
            <p>Hi ${user[0].firstName},</p>
            <p>This is a reminder to set your password for RIP Tool. Click the button below to get started:</p>
            <a href="${invitationLink}" class="button">Set Your Password</a>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #0070f3;">${invitationLink}</p>
            <p>This invitation link will expire in 7 days.</p>
            <div class="footer">
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `,
    )

    const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString("base64")}`,
      },
      body: formData,
    })

    if (!mailgunResponse.ok) {
      console.error("Failed to resend invitation email:", await mailgunResponse.text())
      return NextResponse.json({ error: "Failed to send invitation email" }, { status: 500 })
    }

    return NextResponse.json({
      message: "Invitation resent successfully",
    })
  } catch (error) {
    console.error("Error resending invitation:", error)
    return NextResponse.json({ error: "Failed to resend invitation" }, { status: 500 })
  }
}
