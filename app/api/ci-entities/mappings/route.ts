import { NextResponse } from "next/server"
import { getEntityMappings, addEntityMapping } from "@/lib/ci-entity-utils"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get("entityId")

    if (!entityId) {
      return NextResponse.json({ error: "Missing entityId" }, { status: 400 })
    }

    const mappings = await getEntityMappings(entityId)
    return NextResponse.json({ mappings })
  } catch (error) {
    console.error("Error fetching mappings:", error)
    return NextResponse.json({ error: "Failed to fetch mappings" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { entityId, emailOrDomain } = body

    if (!entityId || !emailOrDomain) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const result = await addEntityMapping(entityId, emailOrDomain)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ mapping: result.mapping })
  } catch (error) {
    console.error("Error adding mapping:", error)
    return NextResponse.json({ error: "Failed to add mapping" }, { status: 500 })
  }
}
