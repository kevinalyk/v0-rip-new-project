import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(req: NextRequest) {
  const authResult = await verifyAuth(req)
  if (!authResult.success || authResult.user?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    // Step 1: Unassign all campaigns from substack.com senders
    const unassigned = await prisma.competitiveInsightCampaign.updateMany({
      where: {
        senderEmail: { endsWith: "@substack.com" },
        entityId: { not: null },
      },
      data: {
        entityId: null,
        assignmentMethod: null,
      },
    })

    // Step 2: Load all entities with a substack donationIdentifier
    const allEntities = await prisma.ciEntity.findMany({
      where: { donationIdentifiers: { not: null } },
      select: { id: true, name: true, donationIdentifiers: true },
    })

    type DonationIdentifiers = { substack?: string; winred?: string[]; anedot?: string[] }

    const substackEntities: Array<{ id: string; name: string; localPart: string }> = []
    for (const entity of allEntities) {
      const identifiers = entity.donationIdentifiers as DonationIdentifiers | null
      if (identifiers?.substack) {
        substackEntities.push({
          id: entity.id,
          name: entity.name,
          localPart: identifiers.substack.toLowerCase(),
        })
      }
    }

    // Step 3: Re-fetch all substack campaigns (now unassigned) and reassign
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        senderEmail: { endsWith: "@substack.com" },
        entityId: null,
      },
      select: { id: true, senderEmail: true, subject: true },
    })

    const assigned: Array<{ campaignId: string; subject: string; entity: string }> = []
    let unmatched = 0

    for (const campaign of campaigns) {
      const localPart = campaign.senderEmail?.split("@")[0]?.toLowerCase()
      if (!localPart) { unmatched++; continue }

      const match = substackEntities.find((e) => e.localPart === localPart)
      if (match) {
        await prisma.competitiveInsightCampaign.update({
          where: { id: campaign.id },
          data: { entityId: match.id, assignmentMethod: "auto_substack" },
        })
        assigned.push({ campaignId: campaign.id, subject: campaign.subject ?? "", entity: match.name })
      } else {
        unmatched++
      }
    }

    return NextResponse.json({
      success: true,
      unassigned: unassigned.count,
      reassigned: assigned.length,
      unmatched,
      samples: assigned.slice(0, 20),
    })
  } catch (error) {
    console.error("[v0] reassign-substack error:", error)
    return NextResponse.json({ error: "Failed to reassign substack campaigns" }, { status: 500 })
  }
}
