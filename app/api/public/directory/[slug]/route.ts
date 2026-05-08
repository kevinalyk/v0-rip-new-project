import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

// Convert a name to a URL slug: "Bernie Sanders" -> "bernie-sanders"
function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params

    // Determine if the requester has full access (paid CI subscription).
    // We check the auth cookie; unauthenticated AND free-tier users are both
    // restricted to the last 3 hours of communications — matching the CI feed
    // and the interactive map.
    let hasFullAccess = false
    const token = request.cookies.get("auth_token")?.value
    if (token) {
      try {
        const payload = await verifyToken(token)
        if (payload) {
          // Any authenticated user with a ciAccessLevel above "none" gets full access.
          // Super admins always get full access.
          const user = await prisma.user.findUnique({
            where: { id: payload.userId as string },
            select: {
              role: true,
              client: { select: { ciSubscriptionPlan: true } },
            },
          })
          if (user) {
            const isSuperAdmin = user.role === "super_admin"
            const ciPlan = user.client?.ciSubscriptionPlan ?? "none"
            hasFullAccess = isSuperAdmin || ciPlan !== "none"
          }
        }
      } catch {
        // Invalid token — treat as unauthenticated
      }
    }

    // The 3-hour cutoff used for restricted users. Sent back to the client so
    // the component can apply per-item blur without any extra logic.
    const cutoffAt = new Date(Date.now() - 3 * 60 * 60 * 1000)

    // Fetch all non-data_broker entities and find the one whose name matches the slug
    const entities = await prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      include: {
        mappings: {
          select: {
            id: true,
            senderEmail: true,
            senderDomain: true,
            senderPhone: true,
          },
        },
        _count: {
          select: {
            campaigns: true,
            smsMessages: true,
          },
        },
      },
    })

    const entity = entities.find((e) => nameToSlug(e.name) === slug)

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 })
    }

    // Get recent campaigns for preview. Restricted users only receive items
    // from the last 3 hours; full-access users get the most recent 10.
    const recentCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: entity.id,
        ...(hasFullAccess ? {} : { dateReceived: { gte: cutoffAt } }),
      },
      orderBy: { dateReceived: "desc" },
      take: 10,
      select: {
        id: true,
        subject: true,
        dateReceived: true,
        senderEmail: true,
      },
    })

    const recentSms = await prisma.smsQueue.findMany({
      where: {
        entityId: entity.id,
        ...(hasFullAccess ? {} : { createdAt: { gte: cutoffAt } }),
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        message: true,
        createdAt: true,
        phoneNumber: true,
      },
    })

    return NextResponse.json({
      // Access context — used by the client to render the correct paywall state
      hasFullAccess,
      cutoffAt: cutoffAt.toISOString(),
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        party: entity.party,
        state: entity.state,
        slug: nameToSlug(entity.name),
        mappings: entity.mappings,
        imageUrl: entity.imageUrl ?? null,
        bio: entity.bio ?? null,
        office: entity.office ?? null,
        ballotpediaUrl: entity.ballotpediaUrl ?? null,
        donationIdentifiers: (entity.donationIdentifiers as Record<string, string[]> | null) ?? null,
        counts: {
          emails: entity._count.campaigns,
          sms: entity._count.smsMessages,
          total: entity._count.campaigns + entity._count.smsMessages,
        },
      },
      recentCampaigns: recentCampaigns.map((c) => ({
        id: c.id,
        subject: c.subject,
        senderEmail: c.senderEmail,
        dateReceived: c.dateReceived?.toISOString() ?? null,
      })),
      recentSms: recentSms.map((s) => ({
        id: s.id,
        message: s.message,
        phoneNumber: s.phoneNumber,
        createdAt: s.createdAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    console.error("Error in public directory API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
