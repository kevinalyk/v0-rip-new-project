import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { cookies } from "next/headers"
import jwt from "jsonwebtoken"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    })

    if (!user || !user.clientId) {
      return NextResponse.json({ error: "User not found or not associated with a client" }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get("entityId")

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID is required" }, { status: 400 })
    }

    const subscription = await prisma.ciEntitySubscription.findUnique({
      where: {
        clientId_entityId: {
          clientId: user.clientId,
          entityId,
        },
      },
    })

    return NextResponse.json({ subscribed: !!subscription })
  } catch (error) {
    console.error("Error checking subscription:", error)
    return NextResponse.json({ error: "Failed to check subscription" }, { status: 500 })
  }
}
