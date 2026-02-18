import { NextResponse } from "next/server"
import bcryptjs from "bcryptjs"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required" }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters long" }, { status: 400 })
    }

    const invitation = await prisma.userInvitation.findFirst({
      where: {
        token: token,
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        used: true,
      },
    })

    if (!invitation) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    // Check if token has been used
    if (invitation.used) {
      return NextResponse.json({ error: "Token has already been used" }, { status: 400 })
    }

    // Check if token has expired
    if (new Date() > new Date(invitation.expiresAt)) {
      return NextResponse.json({ error: "Token has expired" }, { status: 400 })
    }

    // Hash the new password
    const hashedPassword = await bcryptjs.hash(password, 10)

    // Update user password and mark first login as false
    await prisma.user.update({
      where: { id: invitation.userId },
      data: {
        password: hashedPassword,
        firstLogin: false,
      },
    })

    await prisma.userInvitation.update({
      where: { id: invitation.id },
      data: { used: true },
    })

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
