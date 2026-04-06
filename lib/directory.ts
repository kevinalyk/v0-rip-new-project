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
    if (!entity) return null

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
    }
  } catch (error) {
    console.error("[directory] Error fetching entity by slug:", error)
    return null
  }
}
