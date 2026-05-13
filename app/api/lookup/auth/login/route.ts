import { type NextRequest, NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import { neon } from "@neondatabase/serverless"
import { createLookupToken, LOOKUP_COOKIE } from "@/lib/lookup-auth"

const sql = neon(process.env.DATABASE_URL!)

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    const rows = await sql`
      SELECT id, email, "passwordHash"
      FROM "LookupUser"
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      )
    }

    const user = rows[0]
    const match = await bcryptjs.compare(password, user.passwordHash)

    if (!match) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      )
    }

    const token = await createLookupToken({ userId: user.id, email: user.email })

    const response = NextResponse.json({
      user: { id: user.id, email: user.email },
    })

    response.cookies.set({
      name: LOOKUP_COOKIE,
      value: token,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
    })

    return response
  } catch (error) {
    console.error("[lookup/login]", error)
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 }
    )
  }
}
