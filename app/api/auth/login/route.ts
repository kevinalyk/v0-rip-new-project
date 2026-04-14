import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"
import { createToken } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()
    const normalizedEmail = email.toLowerCase()

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        client: {
          select: {
            id: true,
            slug: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const passwordMatch = await bcryptjs.compare(password, user.password)
    if (!passwordMatch) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    const tokenPayload = {
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      clientId: user.clientId,
      clientSlug: user.client?.slug || null,
    }
    const token = await createToken(tokenPayload)

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        firstLogin: user.firstLogin,
      },
    })

    response.cookies.set({
      name: "auth_token",
      value: token,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })

    await prisma.user.update({
      where: { id: user.id },
      data: { lastActive: new Date() },
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
