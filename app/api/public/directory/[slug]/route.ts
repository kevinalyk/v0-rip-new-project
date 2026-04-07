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

    // Get recent campaigns for preview
    const recentCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: { entityId: entity.id },
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
      where: { entityId: entity.id },
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
