import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function POST(request: Request) {
  try {
    const { token } = await request.json()

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    const invitation = await prisma.$queryRaw<Array<{ id: string; userid: string; expiresat: Date; used: boolean }>>`
      SELECT id, userid, expiresat, used
      FROM "UserInvitation"
      WHERE token = ${token}
      LIMIT 1
    `

    if (!invitation || invitation.length === 0) {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 })
    }

    const inv = invitation[0]

    // Check if token has been used
    if (inv.used) {
      return NextResponse.json({ error: "Token has already been used" }, { status: 400 })
    }

    // Check if token has expired
    if (new Date() > new Date(inv.expiresat)) {
      return NextResponse.json({ error: "Token has expired" }, { status: 400 })
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error("Error validating invitation token:", error)
    return NextResponse.json({ error: "Failed to validate token" }, { status: 500 })
  }
}
