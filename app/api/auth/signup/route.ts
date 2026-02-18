import { type NextRequest, NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import { prisma } from "@/lib/prisma"

const signupAttempts = new Map<string, { count: number; resetTime: number }>()
const MAX_ATTEMPTS = 3
const RATE_LIMIT_WINDOW = 60 * 60 * 1000 // 1 hour in milliseconds

function checkRateLimit(ip: string): { allowed: boolean; remainingTime?: number } {
  const now = Date.now()
  const attempt = signupAttempts.get(ip)

  if (!attempt || now > attempt.resetTime) {
    // Reset or create new entry
    signupAttempts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW })
    return { allowed: true }
  }

  if (attempt.count >= MAX_ATTEMPTS) {
    const remainingTime = Math.ceil((attempt.resetTime - now) / 1000 / 60) // minutes
    return { allowed: false, remainingTime }
  }

  attempt.count++
  return { allowed: true }
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown"
    const rateCheck = checkRateLimit(ip)

    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: `Too many signup attempts. Please try again in ${rateCheck.remainingTime} minutes.` },
        { status: 429 },
      )
    }

    const body = await request.json()
    const { clientName, firstName, lastName, email, password, _hp, _ts } = body

    if (_hp) {
      return NextResponse.json({ error: "Invalid submission" }, { status: 400 })
    }

    if (_ts) {
      const timeElapsed = Date.now() - _ts
      if (timeElapsed < 3000) {
        return NextResponse.json({ error: "Submission too fast" }, { status: 400 })
      }
    }

    // Validate required fields
    if (!clientName || !firstName || !lastName || !email || !password) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 })
    }

    // Validate password requirements
    if (password.length < 12) {
      return NextResponse.json({ error: "Password must be at least 12 characters long" }, { status: 400 })
    }
    if (!/\d/.test(password)) {
      return NextResponse.json({ error: "Password must contain at least one number" }, { status: 400 })
    }
    if (!/[a-zA-Z]/.test(password)) {
      return NextResponse.json({ error: "Password must contain at least one letter" }, { status: 400 })
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return NextResponse.json({ error: "Password must contain at least one symbol" }, { status: 400 })
    }

    // Check if email already exists (case-insensitive)
    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
    })

    if (existingUser) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 400 })
    }

    // Check if client name already exists (case-insensitive)
    const existingClient = await prisma.client.findFirst({
      where: {
        name: {
          equals: clientName,
          mode: "insensitive",
        },
      },
    })

    if (existingClient) {
      return NextResponse.json(
        {
          error:
            "A client with this name already exists. If you're trying to join an existing organization, please contact your administrator to be added to the account.",
        },
        { status: 400 },
      )
    }

    // Generate client ID and slug from name
    // ID: lowercase with underscores (e.g., "red_spark_strategy")
    const clientId = clientName.toLowerCase().replace(/\s+/g, "_")

    // Slug: lowercase with no spaces (e.g., "redsparkstrategy")
    const clientSlug = clientName.toLowerCase().replace(/\s+/g, "")

    // Check if generated ID or slug already exists
    const existingClientById = await prisma.client.findFirst({
      where: {
        OR: [{ id: clientId }, { slug: clientSlug }],
      },
    })

    if (existingClientById) {
      return NextResponse.json(
        {
          error:
            "A client with a similar name already exists. If you're trying to join an existing organization, please contact your administrator to be added to the account.",
        },
        { status: 400 },
      )
    }

    // Generate description
    const createdDate = new Date().toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    })
    const description = `Created by ${firstName} ${lastName} on ${createdDate}`

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 10)

    // Create client and user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create client
      const client = await tx.client.create({
        data: {
          id: clientId,
          name: clientName,
          slug: clientSlug,
          description,
          active: true,
          dataRetentionDays: 90,
        },
      })

      // Create user
      const user = await tx.user.create({
        data: {
          email,
          firstName,
          lastName,
          password: hashedPassword,
          role: "owner",
          firstLogin: false,
          clientId: client.id,
          lastActive: new Date(),
        },
      })

      return { client, user }
    })

    return NextResponse.json(
      {
        message: "Account created successfully",
        clientId: result.client.id,
        userId: result.user.id,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[Server Error] Signup failed:", error)
    return NextResponse.json({ error: "An error occurred during signup. Please try again." }, { status: 500 })
  }
}
