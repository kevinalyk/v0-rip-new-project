import { type NextRequest, NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"
import { createLookupToken, LOOKUP_COOKIE } from "@/lib/lookup-auth"

// Simple in-memory rate limiter — resets on cold start
const attempts = new Map<string, { count: number; reset: number }>()
function rateLimit(ip: string) {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.reset) {
    attempts.set(ip, { count: 1, reset: now + 60 * 60 * 1000 })
    return true
  }
  if (entry.count >= 5) return false
  entry.count++
  return true
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown"

    if (!rateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many signup attempts. Please try again later." },
        { status: 429 }
      )
    }

    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      )
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email address." }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check if the email already exists in the main User table
    const existing = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: "insensitive" } },
    })

    if (existing) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please log in instead." },
        { status: 400 }
      )
    }

    const passwordHash = await bcryptjs.hash(password, 12)

    // Create in the main User table with role "lookup" — no clientId needed
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        firstName: "",
        lastName: "",
        password: passwordHash,
        role: "lookup",
        firstLogin: false,
        digestEnabled: false,
        weeklyDigestEnabled: false,
      },
    })

    const token = await createLookupToken({ userId: user.id, email: user.email })

    const response = NextResponse.json(
      { user: { id: user.id, email: user.email } },
      { status: 201 }
    )

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
    console.error("[lookup/signup]", error)
    return NextResponse.json(
      { error: "Signup failed. Please try again." },
      { status: 500 }
    )
  }
}
