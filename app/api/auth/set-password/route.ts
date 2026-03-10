import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 })
    }

    // Find the invitation using raw SQL (UserInvitation table exists but not in Prisma schema)
    const invitations = await sql`
      SELECT id, userid, expiresat, used
      FROM "UserInvitation"
      WHERE token = ${token}
      LIMIT 1
    `

    if (!invitations || invitations.length === 0) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    const invitation = invitations[0]

    // Check if token has been used
    if (invitation.used) {
      return NextResponse.json({ error: "Token has already been used" }, { status: 400 })
    }

    // Check if token has expired
    if (new Date() > new Date(invitation.expiresat)) {
      return NextResponse.json({ error: "Token has expired" }, { status: 400 })
    }

    // Hash the new password
    const hashedPassword = await bcryptjs.hash(password, 10)

    // Update user password and mark first login as false
    await sql`
      UPDATE "User"
      SET password = ${hashedPassword}, "firstLogin" = false, "updatedAt" = NOW()
      WHERE id = ${invitation.userid}
    `

    // Mark invitation as used
    await sql`
      UPDATE "UserInvitation"
      SET used = true
      WHERE id = ${invitation.id}
    `

    return NextResponse.json({ message: "Password set successfully" })
  } catch (error) {
    console.error("Error setting password:", error)
    return NextResponse.json(
      {
        error: "Failed to set password",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
