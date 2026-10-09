import { createHash, randomUUID } from "node:crypto"

import { Prisma, type PrismaClient } from "@prisma/client"

import prisma from "@/lib/prisma"

const SMS_PUSH_WINDOW_MINUTES = 15

type SmsPushCandidate = {
  entityId: string
  preview: string
}

/** Do not include a seed phone or sender number: both can differ for the same blast. */
export function smsPushFingerprint(candidate: SmsPushCandidate): string {
  const message = candidate.preview.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase()
  return createHash("sha256")
    .update(JSON.stringify([candidate.entityId, message]))
    .digest("hex")
}

/**
 * The INSERT/conditional UPDATE is one Postgres statement. Its unique index serializes
 * concurrent webhook invocations. The 15-minute window starts with the first claim,
 * rather than using a clock bucket that could split messages at a boundary.
 */
export async function claimSmsPushAndCreateDelivery(input: {
  userId: string
  sourceId: string
  fingerprint: string
  matchedAlertIds: string[]
}): Promise<string | null> {
  const { userId, sourceId, fingerprint, matchedAlertIds } = input
  try {
    return await (prisma as PrismaClient).$transaction(async (tx) => {
      const claimId = randomUUID()
      const claimed = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO "MobileSmsPushClaim"
          ("id", "userId", "fingerprint", "sourceId", "expiresAt", "createdAt", "updatedAt")
        VALUES
          (${claimId}, ${userId}, ${fingerprint}, ${sourceId},
           (NOW() AT TIME ZONE 'UTC') + ${SMS_PUSH_WINDOW_MINUTES} * INTERVAL '1 minute',
           NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
        ON CONFLICT ("userId", "fingerprint") DO UPDATE
          SET "sourceId" = EXCLUDED."sourceId",
              "expiresAt" = EXCLUDED."expiresAt",
              "updatedAt" = NOW() AT TIME ZONE 'UTC'
          WHERE "MobileSmsPushClaim"."expiresAt" <= (NOW() AT TIME ZONE 'UTC')
        RETURNING "id"
      `
      if (!claimed.length) return null

      const delivery = await tx.mobileAlertDelivery.create({
        data: { userId, sourceType: "sms", sourceId, matchedAlertIds },
        select: { id: true },
      })
      return delivery.id
    })
  } catch (error) {
    // A webhook retry for the same SmsQueue row must not create another delivery.
    // The transaction rolls back its claim when this unique constraint rejects it.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null
    throw error
  }
}

/** A failed Expo batch must not suppress a later copy that could be delivered. */
export async function releaseFailedSmsPushClaim(input: {
  userId: string
  sourceId: string
  fingerprint: string
}): Promise<void> {
  await prisma.mobileSmsPushClaim.deleteMany({ where: input })
}

export { SMS_PUSH_WINDOW_MINUTES }
