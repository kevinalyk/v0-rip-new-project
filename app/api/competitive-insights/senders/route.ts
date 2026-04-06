import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const entities = await prisma.ciEntity.findMany({
      where: {
        type: { not: "data_broker" },
      },
      select: {
        id: true,
        name: true,
        party: true,
        state: true,
      },
      orderBy: {
        name: "asc",
      },
    })

    // Return all entities with their IDs and party/state for cascading filters
    return NextResponse.json({
      entities: entities.map((e) => ({ id: e.id, name: e.name, party: e.party, state: e.state })),
    })
  } catch (error) {
    console.error("Error fetching entities:", error)
    return NextResponse.json({ error: "Failed to fetch entities" }, { status: 500 })
  }
}
