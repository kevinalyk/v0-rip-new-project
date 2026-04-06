import prisma from "@/lib/prisma"

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

export async function getEntityBySlug(slug: string) {
  try {
    const entities = await prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        party: true,
        state: true,
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
    if (!entity) return null

    const recentCampaigns = await prisma.competitiveInsightCampaign.findMany({
      where: { entityId: entity.id },
      orderBy: { dateReceived: "desc" },
      take: 10,
      select: { id: true, subject: true, dateReceived: true, senderEmail: true },
    })

    const recentSms = await prisma.smsQueue.findMany({
      where: { entityId: entity.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, message: true, createdAt: true, phoneNumber: true },
    })

    return {
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
        dateReceived: c.dateReceived ? c.dateReceived.toISOString() : null,
      })),
      recentSms: recentSms.map((s) => ({
        id: s.id,
        message: s.message,
        phoneNumber: s.phoneNumber,
        createdAt: s.createdAt ? s.createdAt.toISOString() : null,
      })),
    }
  } catch (error) {
    console.error("[directory] Error fetching entity by slug:", error)
    return null
  }
}
