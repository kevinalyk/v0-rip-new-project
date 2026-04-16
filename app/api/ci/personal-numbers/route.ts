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

    const searchParams = request.nextUrl.searchParams
    const clientSlug = searchParams.get("clientSlug")

    let targetClientId = user.clientId
    if (user.role === "super_admin" && clientSlug) {
      const targetClient = await prisma.client.findUnique({
        where: { slug: clientSlug },
        select: { id: true },
      })
      if (targetClient) {
        targetClientId = targetClient.id
      }
    }

    const client = await prisma.client.findUnique({
      where: { id: targetClientId },
      select: { subscriptionPlan: true },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    let dateFilter: any = undefined
    if (client.subscriptionPlan === "free") {
      const oneDayAgo = new Date()
      oneDayAgo.setHours(oneDayAgo.getHours() - 24)
      dateFilter = { gte: oneDayAgo }
    } else if (client.subscriptionPlan === "paid") {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      dateFilter = { gte: thirtyDaysAgo }
    }

    // Pagination params (same names as the main CI component sends)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10))
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "10", 10))
    const skip = (page - 1) * limit

    const where = {
      clientId: targetClientId,
      source: "personal",
      isDeleted: false,
      ...(dateFilter && { createdAt: dateFilter }),
    }

    // Fetch total count and paginated records in parallel
    const [total, smsCampaigns] = await Promise.all([
      prisma.smsQueue.count({ where }),
      prisma.smsQueue.findMany({
        where,
        include: { entity: true },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ])

    const transformedSmsCampaigns = smsCampaigns.map((sms) => ({
      id: sms.id,
      type: "sms" as const,
      phoneNumber: sms.phoneNumber,
      message: sms.message,
      // Expose as both emailPreview (used by the detail modal) and smsContent
      emailPreview: sms.message,
      smsContent: sms.message,
      subject: sms.message ? sms.message.slice(0, 80) : "",
      senderName: sms.entity?.name || sms.phoneNumber || "",
      senderEmail: sms.phoneNumber || "",
      dateReceived: sms.createdAt.toISOString(),
      ctaLinks: sms.ctaLinks ? JSON.parse(sms.ctaLinks as string) : [],
      entityId: sms.entityId,
      isHidden: sms.isDeleted,
      clientId: sms.clientId,
      source: sms.source,
      entity: sms.entity
        ? {
            id: sms.entity.id,
            name: sms.entity.name,
            type: sms.entity.type,
            party: sms.entity.party,
            state: sms.entity.state,
          }
        : null,
    }))

    return NextResponse.json({
      insights: transformedSmsCampaigns,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching personal SMS campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch personal SMS campaigns" }, { status: 500 })
  }
}
