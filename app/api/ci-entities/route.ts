import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import {
  getAllEntitiesWithCounts,
  getUnassignedCampaigns,
  getUnassignedSms,
  createEntity,
  updateEntity,
  deleteEntityMapping,
  deleteEntity,
  getTotalCampaignCount,
} from "@/lib/ci-entity-utils"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get("action")

    if (action === "unassigned") {
      const campaigns = await getUnassignedCampaigns()
      const smsMessages = await getUnassignedSms()
      return NextResponse.json({ campaigns, smsMessages })
    }

    if (action === "totalCampaigns") {
      const totalCampaigns = await getTotalCampaignCount()
      return NextResponse.json({ totalCampaigns })
    }

    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "100")
    const party = searchParams.get("party") || undefined
    const state = searchParams.get("state") || undefined
    const type = searchParams.get("type") || undefined
    const search = searchParams.get("search") || undefined

    const result = await getAllEntitiesWithCounts({
      page,
      pageSize,
      party,
      state,
      type,
      search,
    })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in CI entities API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { name, type, description, party, state, donationIdentifiers } = body

    if (!name || !type) {
      return NextResponse.json({ error: "Name and type are required" }, { status: 400 })
    }

    const result = await createEntity(name, type, description, party, state, donationIdentifiers)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ entity: result.entity })
  } catch (error) {
    console.error("Error creating entity:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { id, name, type, description, party, state, donationIdentifiers } = body

    if (!id || !name || !type) {
      return NextResponse.json({ error: "ID, name and type are required" }, { status: 400 })
    }

    const result = await updateEntity(id, name, type, description, party, state, donationIdentifiers)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({ entity: result.entity })
  } catch (error) {
    console.error("Error updating entity:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const mappingId = searchParams.get("mappingId")
    const entityId = searchParams.get("entityId") // Added entityId query param for entity deletion

    if (entityId) {
      const result = await deleteEntity(entityId)

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    if (mappingId) {
      const result = await deleteEntityMapping(mappingId)

      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: "Mapping ID or Entity ID is required" }, { status: 400 })
  } catch (error) {
    console.error("Error deleting:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
