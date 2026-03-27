import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    // Fetch all entity mappings and entities (for Substack handle synthetic mappings)
    const [mappings, entities] = await Promise.all([
      prisma.ciEntityMapping.findMany({
        select: {
          entityId: true,
          senderEmail: true,
          senderDomain: true,
          senderPhone: true,
        },
      }),
      prisma.ciEntity.findMany({
        select: { id: true, donationIdentifiers: true },
      }),
    ])

    // Group mappings by entityId for efficient lookup
    const mappingsByEntity: Record<string, { emails: string[]; domains: string[]; phones: string[] }> = {}

    for (const mapping of mappings) {
      if (!mappingsByEntity[mapping.entityId]) {
        mappingsByEntity[mapping.entityId] = { emails: [], domains: [], phones: [] }
      }
      if (mapping.senderEmail) {
        mappingsByEntity[mapping.entityId].emails.push(mapping.senderEmail.toLowerCase())
      }
      if (mapping.senderDomain) {
        mappingsByEntity[mapping.entityId].domains.push(mapping.senderDomain.toLowerCase())
        // SMS short codes are stored in senderDomain (numeric-only). Mirror them into
        // the phones array so that isDomainMappedToEntity can find them.
        if (/^\d+$/.test(mapping.senderDomain.trim())) {
          mappingsByEntity[mapping.entityId].phones.push(mapping.senderDomain.trim())
        }
      }
      if (mapping.senderPhone) {
        mappingsByEntity[mapping.entityId].phones.push(mapping.senderPhone)
      }
    }

    for (const entity of entities) {
      const identifiers = entity.donationIdentifiers as Record<string, any> | null
      const substackHandle = identifiers?.substack as string | undefined
      const winredHandle = identifiers?.winred as string | undefined
      const anedotHandle = identifiers?.anedot as string | undefined

      // Inject Substack handle as a synthetic email mapping so entities with only
      // a Substack handle are not incorrectly flagged as Third Party.
      if (substackHandle) {
        const substackEmail = `${substackHandle.toLowerCase()}@substack.com`
        if (!mappingsByEntity[entity.id]) {
          mappingsByEntity[entity.id] = { emails: [], domains: [], phones: [] }
        }
        if (!mappingsByEntity[entity.id].emails.includes(substackEmail)) {
          mappingsByEntity[entity.id].emails.push(substackEmail)
        }
      }

      // Ensure entities with WinRed or Anedot identifiers (but no email/domain mappings)
      // still appear in mappingsByEntity with empty arrays. Without this, isDomainMappedToEntity
      // receives `undefined` for the entity and incorrectly returns `true` (mapped), hiding the
      // Third Party badge for campaigns assigned purely via donation platform identifier.
      if ((winredHandle || anedotHandle) && !mappingsByEntity[entity.id]) {
        mappingsByEntity[entity.id] = { emails: [], domains: [], phones: [] }
      }
    }

    return NextResponse.json({ mappingsByEntity })
  } catch (error) {
    console.error("Error fetching all mappings:", error)
    return NextResponse.json({ error: "Failed to fetch mappings" }, { status: 500 })
  }
}
