import { type NextRequest, NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"
import { createLookupToken, LOOKUP_COOKIE } from "@/lib/lookup-auth"

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

    // Look up user in the main User table
    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    })

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      )
    }

    const match = await bcryptjs.compare(password, user.password)
    if (!match) {
      return NextResponse.json(
        { error: "Invalid email or password." },
        { status: 401 }
      )
    }

    // Issue a lookup session token
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

    // Update lastActive non-blocking
    prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    }).catch(() => {})

    return response
  } catch (error) {
    console.error("[lookup/login]", error)
    return NextResponse.json(
      { error: "Login failed. Please try again." },
      { status: 500 }
    )
  }
}
