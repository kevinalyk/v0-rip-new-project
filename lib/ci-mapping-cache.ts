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
    prisma.ciEntity.findMany({ select: { id: true, donationIdentifiers: true } }),
  ])

  const mappingsByEntity: Record<string, MappingEntry> = {}
  const phonesByEntity: Record<string, PhoneEntry> = {}

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
    expiresAt: now + TTL_MS,
  }

  return cache
}

/** Call this whenever mappings are edited in the admin so the cache is immediately fresh. */
export function invalidateEntityMappingCache(): void {
  cache = null
}
