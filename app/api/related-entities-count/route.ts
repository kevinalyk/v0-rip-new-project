import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get("entityId")
    const party = searchParams.get("party") || undefined
    const state = searchParams.get("state") || undefined

    if (!entityId) {
      return NextResponse.json({ error: "Missing entityId" }, { status: 400 })
    }

    // Fetch the current entity to get its details if not provided
    const currentEntity = await prisma.ciEntity.findUnique({
      where: { id: entityId },
      select: { party: true, state: true, type: true },
    })

    if (!currentEntity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 })
    }

    const entityParty = party || currentEntity.party
    const entityState = state || currentEntity.state

    // Count all entities with same party (excluding data brokers)
    const partyCount = entityParty
      ? await prisma.ciEntity.count({
          where: {
            id: { not: entityId },
            party: {
              equals: entityParty,
              mode: "insensitive",
            },
            type: { not: "data_broker" },
          },
        })
      : 0

    // Count all entities with same state (excluding data brokers)
    const stateCount = entityState
      ? await prisma.ciEntity.count({
          where: {
            id: { not: entityId },
            state: entityState,
            type: { not: "data_broker" },
          },
        })
      : 0

    // Count all entities with same state AND party (excluding data brokers)
    const statePartyCount =
      entityState && entityParty
        ? await prisma.ciEntity.count({
            where: {
              id: { not: entityId },
              state: entityState,
              party: {
                equals: entityParty,
                mode: "insensitive",
              },
              type: { not: "data_broker" },
            },
          })
        : 0

    return NextResponse.json({
      partyCount,
      stateCount,
      statePartyCount,
    })
  } catch (error) {
    console.error("[v0] Error fetching related entities count:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
