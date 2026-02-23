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

    // Get admin's user info to get their clientId
    const adminUser = await sql`
      SELECT "clientId", role FROM "User" WHERE id = ${payload.userId}
    `

    if (!adminUser || adminUser.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (adminUser[0].role !== "admin" && adminUser[0].role !== "owner" && adminUser[0].role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { firstName, lastName, email, role, clientSlug } = await request.json()

    // Validate input
    if (!firstName || !lastName || !email || !role) {
      return NextResponse.json({ error: "First name, last name, email, and role are required" }, { status: 400 })
    }

    let targetClientId = adminUser[0].clientId

    // If a clientSlug is provided (super_admin adding user to a specific client), use that client's ID
    if (clientSlug && adminUser[0].role === "super_admin") {
      const targetClient = await sql`
        SELECT id FROM "Client" WHERE slug = ${clientSlug}
      `

      if (!targetClient || targetClient.length === 0) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 })
      }

      targetClientId = targetClient[0].id
    }

    // Check seat limits before inviting
    const clientInfo = await sql`
      SELECT 
        "subscriptionPlan",
        "userSeatsIncluded",
        "additionalUserSeats",
        (SELECT COUNT(*) FROM "User" WHERE "clientId" = ${targetClientId}) as "currentUserCount"
      FROM "Client"
      WHERE id = ${targetClientId}
    `

    if (clientInfo && clientInfo.length > 0) {
      const client = clientInfo[0]
      const currentUserCount = parseInt(client.currentUserCount)
      
      // Default seats by plan
      const defaultSeats = client.subscriptionPlan === "all" ? 3 : client.subscriptionPlan === "enterprise" ? 999 : 1
      const seatsIncluded = client.userSeatsIncluded || defaultSeats
      const additionalSeats = client.additionalUserSeats || 0
      const totalSeatsAllowed = seatsIncluded + additionalSeats

      if (currentUserCount >= totalSeatsAllowed) {
        return NextResponse.json(
          {
            error: `Seat limit reached. You have ${currentUserCount} users and ${totalSeatsAllowed} seats allocated. Please contact support to add more seats.`,
          },
          { status: 403 }
        )
      }
    }

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM "User" WHERE email = ${email}
    `

    if (existingUser && existingUser.length > 0) {
      return NextResponse.json({ error: "User with this email already exists" }, { status: 400 })
    }

    const userId = crypto.randomUUID()

    const newUser = await sql`
      INSERT INTO "User" (id, "firstName", "lastName", email, role, "clientId", "firstLogin", "createdAt", "updatedAt")
      VALUES (${userId}, ${firstName}, ${lastName}, ${email}, ${role}, ${targetClientId}, true, NOW(), NOW())
      RETURNING id, email, "firstName", "lastName"
    `

    // Generate invitation token
    const invitationToken = crypto.randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    // Store invitation token
    await sql`
      INSERT INTO "UserInvitation" (token, userid, expiresat)
      VALUES (${invitationToken}, ${newUser[0].id}, ${expiresAt})
    `

    // Send invitation email via Mailgun
    const invitationLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"}/set-password?token=${invitationToken}`

    const mailgunDomain = process.env.MAILGUN_DOMAIN!
    const mailgunApiKey = process.env.MAILGUN_API_KEY!

    const formData = new FormData()
    formData.append("from", `RIP Tool <hello@${mailgunDomain}>`)
    formData.append("to", email)
    formData.append("subject", "You've been invited to RIP Tool")
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
            <h2>Welcome to RIP Tool!</h2>
            <p>Hi ${firstName},</p>
            <p>You've been invited to join RIP Tool. Click the button below to set your password and get started:</p>
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
      console.error("Failed to send invitation email:", await mailgunResponse.text())
      return NextResponse.json({ error: "User created but failed to send invitation email" }, { status: 500 })
    }

    return NextResponse.json({
      message: "User invited successfully",
      user: newUser[0],
    })
  } catch (error) {
    console.error("Error inviting user:", error)
    return NextResponse.json({ error: "Failed to invite user" }, { status: 500 })
  }
}
