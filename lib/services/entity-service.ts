import { Prisma } from "@prisma/client"
import prisma from "@/lib/prisma"
import { canFollowMoreEntities, getCIFollowLimit, type SubscriptionPlan } from "@/lib/subscription-utils"
import { MobileAuthError } from "@/lib/mobile-auth"

export async function listFollowedEntities(clientId: string) {
  const subs = await prisma.ciEntitySubscription.findMany({
    where: { clientId },
    include: { entity: true },
    orderBy: { createdAt: "desc" },
  })
  return subs.map((s: (typeof subs)[number]) => s.entity)
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

function isSerializationFailure(error: unknown): boolean {
  // P2034 = "Transaction failed due to a write conflict or a deadlock. Please retry
  // your transaction" — Prisma's code for a Serializable transaction that lost a race.
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
}

/**
 * Follows an entity, enforcing the plan's follow limit and staying safe under
 * concurrent calls (e.g. a double-tap, or two devices following at once):
 *
 * - The existence check + count + insert run inside a single Serializable
 *   transaction, so two concurrent transactions that would otherwise both read
 *   "count = limit - 1" and both insert (exceeding the limit) instead conflict —
 *   Postgres aborts one with a serialization failure, which is retried once here.
 * - If a duplicate insert still slips through (e.g. a retried transaction racing
 *   the `ciEntitySubscription_clientId_entityId` unique constraint directly), that
 *   unique-violation is caught and treated as success — following is idempotent,
 *   never a 500.
 */
export async function followEntity(
  clientId: string,
  plan: SubscriptionPlan,
  entityId: string,
  attempt = 0,
): Promise<{ alreadyFollowing: boolean }> {
  const entity = await prisma.ciEntity.findUnique({ where: { id: entityId }, select: { id: true } })
  if (!entity) {
    throw new MobileAuthError(404, "ENTITY_NOT_FOUND", "Entity not found")
  }

  const limit = getCIFollowLimit(plan)

  try {
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const existing = await tx.ciEntitySubscription.findUnique({
          where: { clientId_entityId: { clientId, entityId } },
        })
        if (existing) return { alreadyFollowing: true }

        if (limit !== null) {
          const currentFollowCount = await tx.ciEntitySubscription.count({ where: { clientId } })
          if (!canFollowMoreEntities(plan, currentFollowCount)) {
            throw new MobileAuthError(
              403,
              "FOLLOW_LIMIT_REACHED",
              `Your plan allows following ${limit} ${limit === 1 ? "entity" : "entities"}. Upgrade to follow more.`,
            )
          }
        }

        await tx.ciEntitySubscription.create({ data: { clientId, entityId } })
        return { alreadyFollowing: false }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
    return result
  } catch (error) {
    if (isUniqueConstraintViolation(error)) return { alreadyFollowing: true }
    if (isSerializationFailure(error) && attempt < 3) return followEntity(clientId, plan, entityId, attempt + 1)
    throw error
  }
}

export async function unfollowEntity(clientId: string, entityId: string) {
  await prisma.ciEntitySubscription.deleteMany({ where: { clientId, entityId } })
}
