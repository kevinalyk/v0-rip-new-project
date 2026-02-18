import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET() {
  try {
    // Fetch all entity mappings for domain checking
    const mappings = await prisma.ciEntityMapping.findMany({
      select: {
        entityId: true,
        senderEmail: true,
        senderDomain: true,
        senderPhone: true,
      },
    })

    // Group mappings by entityId for efficient lookup
    const mappingsByEntity: Record<string, { emails: string[]; domains: string[]; phones: string[] }> = {}

    for (const mapping of mappings) {
      if (!mappingsByEntity[mapping.entityId]) {
        mappingsByEntity[mapping.entityId] = {
          emails: [],
          domains: [],
          phones: [],
        }
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

    return NextResponse.json({ mappingsByEntity })
  } catch (error) {
    console.error("Error fetching all mappings:", error)
    return NextResponse.json({ error: "Failed to fetch mappings" }, { status: 500 })
  }
}
