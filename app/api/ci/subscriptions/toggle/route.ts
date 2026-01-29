import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { cookies } from "next/headers"
import jwt from "jsonwebtoken"
import { canFollowMoreEntities, getCIFollowLimit } from "@/lib/subscription-utils"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { client: true },
    })

    if (!user || !user.clientId) {
      return NextResponse.json({ error: "User not found or not associated with a client" }, { status: 404 })
    }

    const { entityId } = await request.json()

    if (!entityId) {
      return NextResponse.json({ error: "Entity ID is required" }, { status: 400 })
    }

    // Check if subscription exists
    const existingSubscription = await prisma.ciEntitySubscription.findUnique({
      where: {
        clientId_entityId: {
          clientId: user.clientId,
          entityId,
        },
      },
    })

    if (existingSubscription) {
      // Unsubscribe
      await prisma.ciEntitySubscription.delete({
        where: { id: existingSubscription.id },
      })
      return NextResponse.json({ subscribed: false })
    } else {
      const subscriptionPlan = user.client?.subscriptionPlan || "free"

      // Count current subscriptions
      const currentFollowCount = await prisma.ciEntitySubscription.count({
        where: { clientId: user.clientId },
      })

      // Check if user can follow more entities
      if (!canFollowMoreEntities(subscriptionPlan, currentFollowCount)) {
        const limit = getCIFollowLimit(subscriptionPlan)
        return NextResponse.json(
          {
            error: "Follow limit reached",
            message: `Your plan allows following ${limit} ${limit === 1 ? "entity" : "entities"}. Upgrade to follow more.`,
            currentCount: currentFollowCount,
            limit: limit,
          },
          { status: 403 },
        )
      }

      // Subscribe
      await prisma.ciEntitySubscription.create({
        data: {
          clientId: user.clientId,
          entityId,
        },
      })
      return NextResponse.json({ subscribed: true })
    }
  } catch (error) {
    console.error("Error toggling subscription:", error)
    return NextResponse.json({ error: "Failed to toggle subscription" }, { status: 500 })
  }
}
