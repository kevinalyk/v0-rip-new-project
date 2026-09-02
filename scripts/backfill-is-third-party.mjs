/**
 * Backfill script: compute and store `isThirdParty` on already-assigned
 * CompetitiveInsightCampaign and SmsQueue rows, using the same canonical
 * classification logic as lib/ci-mapping-cache.ts (isSenderThirdParty /
 * isPhoneThirdParty), reimplemented here in plain JS since this script runs
 * outside the Next.js/TS toolchain.
 *
 * Classification (identical for data-broker entities as any other — neither live
 * route special-cases them in this specific match, see lib/ci-mapping-cache.ts):
 *   - No entity assigned -> null (skipped, nothing to do)
 *   - Entity has no known mappings -> false (house file by default)
 *   - Sender email/domain (or phone) IS in the entity's known mappings -> false
 *   - Sender email/domain (or phone) is NOT in the entity's known mappings -> true
 *
 * Run with: node --env-file-if-exists=/vercel/share/.env.project scripts/backfill-is-third-party.mjs
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function loadMappings() {
  const [allMappings, allEntities] = await Promise.all([
    prisma.ciEntityMapping.findMany({
      select: { entityId: true, senderEmail: true, senderDomain: true, senderPhone: true },
    }),
    prisma.ciEntity.findMany({ select: { id: true, type: true, donationIdentifiers: true } }),
  ])

  const mappingsByEntity = {}
  const phonesByEntity = {}
  const entityTypeById = {}

  for (const entity of allEntities) {
    entityTypeById[entity.id] = entity.type
  }

  for (const m of allMappings) {
    if (!mappingsByEntity[m.entityId]) {
      mappingsByEntity[m.entityId] = { emails: new Set(), domains: new Set() }
    }
    if (m.senderEmail) mappingsByEntity[m.entityId].emails.add(m.senderEmail.toLowerCase())
    if (m.senderDomain) mappingsByEntity[m.entityId].domains.add(m.senderDomain.toLowerCase())

    if (!phonesByEntity[m.entityId]) phonesByEntity[m.entityId] = new Set()
    if (m.senderPhone) phonesByEntity[m.entityId].add(m.senderPhone)
    if (m.senderDomain && /^\d+$/.test(m.senderDomain.trim())) {
      phonesByEntity[m.entityId].add(m.senderDomain.trim())
    }
  }

  for (const entity of allEntities) {
    const handle = entity.donationIdentifiers?.substack
    if (handle) {
      if (!mappingsByEntity[entity.id]) {
        mappingsByEntity[entity.id] = { emails: new Set(), domains: new Set() }
      }
      mappingsByEntity[entity.id].emails.add(`${handle.toLowerCase()}@substack.com`)
    }
  }

  return { mappingsByEntity, phonesByEntity, entityTypeById }
}

async function backfillCampaigns(mappings) {
  const { mappingsByEntity } = mappings

  const distinctEntities = await prisma.competitiveInsightCampaign.findMany({
    where: { entityId: { not: null }, isThirdParty: null },
    select: { entityId: true },
    distinct: ["entityId"],
  })
  console.log(`[backfill] ${distinctEntities.length} distinct entities with unclassified campaigns`)

  let houseFileUpdated = 0
  let thirdPartyUpdated = 0

  for (const { entityId } of distinctEntities) {
    const em = mappingsByEntity[entityId]
    const baseWhere = { entityId, isThirdParty: null }

    if (em && (em.emails.size > 0 || em.domains.size > 0)) {
      // Known senders for this entity -> house file (false)
      const orClauses = [
        ...(em.emails.size > 0 ? [{ senderEmail: { in: [...em.emails] } }] : []),
        ...[...em.domains].map((d) => ({ senderEmail: { endsWith: `@${d}`, mode: "insensitive" } })),
      ]
      if (orClauses.length > 0) {
        const res = await prisma.competitiveInsightCampaign.updateMany({
          where: { ...baseWhere, OR: orClauses },
          data: { isThirdParty: false },
        })
        houseFileUpdated += res.count
      }
    }

    // Everything else still unclassified for this entity -> third party (true)
    const res = await prisma.competitiveInsightCampaign.updateMany({
      where: baseWhere,
      data: { isThirdParty: true },
    })
    thirdPartyUpdated += res.count
  }

  console.log(`[backfill] Campaigns: ${houseFileUpdated} house file, ${thirdPartyUpdated} third party`)
}

async function backfillSms(mappings) {
  const { phonesByEntity } = mappings

  const distinctEntities = await prisma.smsQueue.findMany({
    where: { entityId: { not: null }, isThirdParty: null },
    select: { entityId: true },
    distinct: ["entityId"],
  })
  console.log(`[backfill] ${distinctEntities.length} distinct entities with unclassified SMS`)

  let houseFileUpdated = 0
  let thirdPartyUpdated = 0

  for (const { entityId } of distinctEntities) {
    const phones = phonesByEntity[entityId]
    const baseWhere = { entityId, isThirdParty: null }

    if (phones && phones.size > 0) {
      const res = await prisma.smsQueue.updateMany({
        where: { ...baseWhere, phoneNumber: { in: [...phones] } },
        data: { isThirdParty: false },
      })
      houseFileUpdated += res.count
    }

    const res = await prisma.smsQueue.updateMany({
      where: baseWhere,
      data: { isThirdParty: true },
    })
    thirdPartyUpdated += res.count
  }

  console.log(`[backfill] SMS: ${houseFileUpdated} house file, ${thirdPartyUpdated} third party`)
}

async function main() {
  console.log("[backfill] Loading entity mappings...")
  const mappings = await loadMappings()

  console.log("[backfill] Backfilling campaigns...")
  await backfillCampaigns(mappings)

  console.log("[backfill] Backfilling SMS...")
  await backfillSms(mappings)

  console.log("[backfill] Done.")
}

main()
  .catch((err) => {
    console.error("[backfill] Error:", err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
