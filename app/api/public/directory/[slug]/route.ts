import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

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

    // Fetch all non-data_broker entities and find the one whose name matches the slug
    const entities = await prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      include: {
        mappings: {
          select: {
            id: true,
            emailDomain: true,
            shortCode: true,
            platform: true,
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

    // Get recent campaigns (last 10) for preview - no auth required, just metadata
    const recentCampaigns = await prisma.ciCampaign.findMany({
      where: { entityId: entity.id },
      orderBy: { sentAt: "desc" },
      take: 10,
      select: {
        id: true,
        subject: true,
        sentAt: true,
        fromEmail: true,
      },
    })

    const recentSms = await prisma.ciSmsMessage.findMany({
      where: { entityId: entity.id },
      orderBy: { receivedAt: "desc" },
      take: 5,
      select: {
        id: true,
        body: true,
        receivedAt: true,
        shortCode: true,
      },
    })

    return NextResponse.json({
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        party: entity.party,
        state: entity.state,
        slug: nameToSlug(entity.name),
        mappings: entity.mappings,
        counts: {
          emails: entity._count.campaigns,
          sms: entity._count.smsMessages,
          total: entity._count.campaigns + entity._count.smsMessages,
        },
      },
      recentCampaigns,
      recentSms,
    })
  } catch (error) {
    console.error("Error in public directory API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
