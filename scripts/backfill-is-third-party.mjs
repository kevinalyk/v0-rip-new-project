/**
 * Backfill script: compute and store `isThirdParty` on already-assigned
 * CompetitiveInsightCampaign and SmsQueue rows, using the same canonical
 * classification logic as lib/ci-mapping-cache.ts (isSenderThirdParty /
 * isPhoneThirdParty), reimplemented here in plain JS since this script runs
 * outside the Next.js/TS toolchain.
 *
 * Classification:
 *   - No entity assigned -> null (skipped, nothing to do)
 *   - Entity is a data broker -> null (excluded from this facet)
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

function classifySender(entityId, senderEmail, { mappingsByEntity, entityTypeById }) {
  if (!entityId) return null
  if (entityTypeById[entityId] === "data_broker") return null
  const em = mappingsByEntity[entityId]
  if (!em) return false
  const email = (senderEmail ?? "").toLowerCase()
  const domain = email.split("@")[1]
  return !em.emails.has(email) && (!domain || !em.domains.has(domain))
}

function classifyPhone(entityId, phoneNumber, { phonesByEntity, entityTypeById }) {
  if (!entityId) return null
  if (entityTypeById[entityId] === "data_broker") return null
  const phones = phonesByEntity[entityId]
  if (!phones) return false
  return !phones.has(phoneNumber ?? "")
}

async function main() {
  console.log("[backfill] Loading entity mappings...")
  const mappings = await loadMappings()

  console.log("[backfill] Fetching assigned campaigns missing isThirdParty...")
  const campaigns = await prisma.competitiveInsightCampaign.findMany({
    where: { entityId: { not: null }, isThirdParty: null },
    select: { id: true, entityId: true, senderEmail: true },
  })
  console.log(`[backfill] ${campaigns.length} campaigns to classify`)

  let campaignUpdated = 0
  for (const c of campaigns) {
    const isThirdParty = classifySender(c.entityId, c.senderEmail, mappings)
    if (isThirdParty === null) continue // data broker or no entity - leave null
    await prisma.competitiveInsightCampaign.update({
      where: { id: c.id },
      data: { isThirdParty },
    })
    campaignUpdated++
  }
  console.log(`[backfill] Updated ${campaignUpdated} campaigns`)

  console.log("[backfill] Fetching assigned SMS missing isThirdParty...")
  const smsMessages = await prisma.smsQueue.findMany({
    where: { entityId: { not: null }, isThirdParty: null },
    select: { id: true, entityId: true, phoneNumber: true },
  })
  console.log(`[backfill] ${smsMessages.length} SMS messages to classify`)

  let smsUpdated = 0
  for (const s of smsMessages) {
    const isThirdParty = classifyPhone(s.entityId, s.phoneNumber, mappings)
    if (isThirdParty === null) continue
    await prisma.smsQueue.update({
      where: { id: s.id },
      data: { isThirdParty },
    })
    smsUpdated++
  }
  console.log(`[backfill] Updated ${smsUpdated} SMS messages`)

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
