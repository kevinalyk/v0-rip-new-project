import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

// Resolve whether a token holder has full CI access (paid plan or super_admin).
// Returns false for invalid/missing tokens or free-tier users.
async function resolveFullAccess(token: string | undefined): Promise<boolean> {
  if (!token) return false
  try {
    const payload = await verifyToken(token)
    if (!payload) return false
    const user = await prisma.user.findUnique({
      where: { id: payload.userId as string },
      select: {
        role: true,
        client: { select: { ciSubscriptionPlan: true } },
      },
    })
    if (!user) return false
    return user.role === "super_admin" || (user.client?.ciSubscriptionPlan ?? "none") !== "none"
  } catch {
    return false
  }
}

export async function getEntityBySlug(slug: string, authToken?: string) {
  try {
    const hasFullAccess = await resolveFullAccess(authToken)
    const cutoffAt = new Date(Date.now() - 3 * 60 * 60 * 1000)

    const entities = await prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      select: {
        id: true,
        name: true,
        type: true,
        description: true,
        party: true,
        state: true,
        imageUrl: true,
        bio: true,
        office: true,
        ballotpediaUrl: true,
        donationIdentifiers: true,
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
      where: {
        entityId: entity.id,
        ...(hasFullAccess ? {} : { dateReceived: { gte: cutoffAt } }),
      },
      orderBy: { dateReceived: "desc" },
      take: 10,
      select: { id: true, subject: true, dateReceived: true, senderEmail: true },
    })

    const recentSms = await prisma.smsQueue.findMany({
      where: {
        entityId: entity.id,
        ...(hasFullAccess ? {} : { createdAt: { gte: cutoffAt } }),
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, message: true, createdAt: true, phoneNumber: true },
    })

    return {
      hasFullAccess,
      cutoffAt: cutoffAt.toISOString(),
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        description: entity.description,
        party: entity.party,
        state: entity.state,
        imageUrl: entity.imageUrl ?? null,
        bio: entity.bio ?? null,
        office: entity.office ?? null,
        ballotpediaUrl: entity.ballotpediaUrl ?? null,
        donationIdentifiers: (entity.donationIdentifiers as Record<string, string[]> | null) ?? null,
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
