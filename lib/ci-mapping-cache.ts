/**
 * Module-level in-memory cache for CiEntityMapping + CiEntity lookups.
 * These tables change infrequently (admin edits only), so a 5-minute TTL
 * eliminates 2-4 extra DB queries on every houseFile/thirdParty CI request.
 */
import prisma from "@/lib/prisma"

type MappingEntry = { emails: Set<string>; domains: Set<string> }
type PhoneEntry = Set<string>

interface MappingCache {
  mappingsByEntity: Record<string, MappingEntry>
  phonesByEntity: Record<string, PhoneEntry>
  entityTypeById: Record<string, string>
  expiresAt: number
}

const TTL_MS = 5 * 60 * 1000 // 5 minutes

let cache: MappingCache | null = null

export async function getEntityMappings(): Promise<MappingCache> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) {
    return cache
  }

  const [allMappings, allEntities] = await Promise.all([
    prisma.ciEntityMapping.findMany({
      select: { entityId: true, senderEmail: true, senderDomain: true, senderPhone: true },
    }),
    prisma.ciEntity.findMany({ select: { id: true, type: true, donationIdentifiers: true } }),
  ])

  const mappingsByEntity: Record<string, MappingEntry> = {}
  const phonesByEntity: Record<string, PhoneEntry> = {}
  const entityTypeById: Record<string, string> = {}
  for (const entity of allEntities) {
    entityTypeById[entity.id] = entity.type
  }

  for (const m of allMappings) {
    if (!mappingsByEntity[m.entityId]) {
      mappingsByEntity[m.entityId] = { emails: new Set(), domains: new Set() }
    }
    if (m.senderEmail) mappingsByEntity[m.entityId].emails.add(m.senderEmail.toLowerCase())
    if (m.senderDomain) mappingsByEntity[m.entityId].domains.add(m.senderDomain.toLowerCase())

    // Phone / short code mappings
    if (!phonesByEntity[m.entityId]) phonesByEntity[m.entityId] = new Set()
    if (m.senderPhone) phonesByEntity[m.entityId].add(m.senderPhone)
    if (m.senderDomain && /^\d+$/.test(m.senderDomain.trim())) {
      phonesByEntity[m.entityId].add(m.senderDomain.trim())
    }
  }

  // Inject Substack handles as synthetic email mappings
  for (const entity of allEntities) {
    const handle = (entity.donationIdentifiers as any)?.substack as string | undefined
    if (handle) {
      if (!mappingsByEntity[entity.id]) {
        mappingsByEntity[entity.id] = { emails: new Set(), domains: new Set() }
      }
      mappingsByEntity[entity.id].emails.add(`${handle.toLowerCase()}@substack.com`)
    }
  }

  cache = {
    mappingsByEntity,
    phonesByEntity,
    entityTypeById,
    expiresAt: now + TTL_MS,
  }

  return cache
}

/** Call this whenever mappings are edited in the admin so the cache is immediately fresh. */
export function invalidateEntityMappingCache(): void {
  cache = null
}

/**
 * Canonical third-party/house-file classification for an email sender, mirroring the
 * live filter logic used by the CI feed and analytics routes:
 *   - No entity assigned yet → null (not applicable)
 *   - Entity is a data broker → null (data brokers are excluded from this facet entirely)
 *   - Entity has no known mappings → false (house file by default)
 *   - Sender email/domain IS in the entity's known mappings → false (house file)
 *   - Sender email/domain is NOT in the entity's known mappings → true (third party)
 *
 * Call this at the moment entityId is set (ingestion auto-assignment or manual/API
 * assignment) so the result can be frozen and stored on the row via `isThirdParty`.
 */
export async function isSenderThirdParty(
  entityId: string | null | undefined,
  senderEmail: string | null | undefined,
): Promise<boolean | null> {
  if (!entityId) return null
  const { mappingsByEntity, entityTypeById } = await getEntityMappings()
  if (entityTypeById[entityId] === "data_broker") return null
  const em = mappingsByEntity[entityId]
  if (!em) return false
  const email = (senderEmail ?? "").toLowerCase()
  const domain = email.split("@")[1]
  return !em.emails.has(email) && (!domain || !em.domains.has(domain))
}

/**
 * Canonical third-party/house-file classification for an SMS sender phone number.
 * Same semantics as isSenderThirdParty, but matched against senderPhone mappings.
 */
export async function isPhoneThirdParty(
  entityId: string | null | undefined,
  phoneNumber: string | null | undefined,
): Promise<boolean | null> {
  if (!entityId) return null
  const { phonesByEntity, entityTypeById } = await getEntityMappings()
  if (entityTypeById[entityId] === "data_broker") return null
  const phones = phonesByEntity[entityId]
  if (!phones) return false
  return !phones.has(phoneNumber ?? "")
}
