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
      }
      if (mapping.senderPhone) {
        mappingsByEntity[mapping.entityId].phones.push(mapping.senderPhone)
      }
    }

    // Inject Substack handle as a synthetic email mapping so that entities with only
    // a Substack handle (and no explicit email mapping) are not flagged as Third Party.
    for (const entity of entities) {
      const identifiers = entity.donationIdentifiers as Record<string, any> | null
      const substackHandle = identifiers?.substack as string | undefined
      if (substackHandle) {
        const substackEmail = `${substackHandle.toLowerCase()}@substack.com`
        if (!mappingsByEntity[entity.id]) {
          mappingsByEntity[entity.id] = { emails: [], domains: [], phones: [] }
        }
        if (!mappingsByEntity[entity.id].emails.includes(substackEmail)) {
          mappingsByEntity[entity.id].emails.push(substackEmail)
        }
      }
    }

    return NextResponse.json({ mappingsByEntity })
  } catch (error) {
    console.error("Error fetching all mappings:", error)
    return NextResponse.json({ error: "Failed to fetch mappings" }, { status: 500 })
  }
}
