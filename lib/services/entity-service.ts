import prisma from "@/lib/prisma"
import { canFollowMoreEntities, getCIFollowLimit, type SubscriptionPlan } from "@/lib/subscription-utils"
import { MobileAuthError } from "@/lib/mobile-auth"

export async function listFollowedEntities(clientId: string) {
  const subs = await prisma.ciEntitySubscription.findMany({
    where: { clientId },
    include: { entity: true },
    orderBy: { createdAt: "desc" },
  })
  return subs.map((s) => s.entity)
}

export async function followEntity(clientId: string, plan: SubscriptionPlan, entityId: string) {
  const entity = await prisma.ciEntity.findUnique({ where: { id: entityId }, select: { id: true } })
  if (!entity) {
    throw new MobileAuthError(404, "ENTITY_NOT_FOUND", "Entity not found")
  }

  const existing = await prisma.ciEntitySubscription.findUnique({
    where: { clientId_entityId: { clientId, entityId } },
  })
  if (existing) return { alreadyFollowing: true }

  const currentFollowCount = await prisma.ciEntitySubscription.count({ where: { clientId } })
  if (!canFollowMoreEntities(plan, currentFollowCount)) {
    const limit = getCIFollowLimit(plan)
    throw new MobileAuthError(
      403,
      "FOLLOW_LIMIT_REACHED",
      `Your plan allows following ${limit} ${limit === 1 ? "entity" : "entities"}. Upgrade to follow more.`,
    )
  }

  await prisma.ciEntitySubscription.create({ data: { clientId, entityId } })
  return { alreadyFollowing: false }
}

export async function unfollowEntity(clientId: string, entityId: string) {
  await prisma.ciEntitySubscription.deleteMany({ where: { clientId, entityId } })
}
