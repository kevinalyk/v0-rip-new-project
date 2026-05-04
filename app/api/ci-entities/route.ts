import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { verifyAuth } from "@/lib/auth"
import prisma from "@/lib/prisma"
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
    const ballotpedia = searchParams.get("ballotpedia") || undefined
    const sortParam = searchParams.get("sort")
    const sortBy =
      sortParam === "newest" || sortParam === "oldest" || sortParam === "name" ? sortParam : undefined

    const result = await getAllEntitiesWithCounts({
      page,
      pageSize,
      party,
      state,
      type,
      search,
      ballotpedia,
      sortBy,
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
    const { name, type, description, party, state, donationIdentifiers, ballotpediaUrl } = body

    if (!name || !type) {
      return NextResponse.json({ error: "Name and type are required" }, { status: 400 })
    }

    const result = await createEntity(name, type, description, party, state, donationIdentifiers, ballotpediaUrl)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Auto-trigger Ballotpedia scraper for any entity type (extractors handle missing data gracefully)
    if (ballotpediaUrl && result.entity) {
      const baseUrl = request.nextUrl.origin
      fetch(`${baseUrl}/api/admin/scrape-ballotpedia`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
        body: JSON.stringify({ entityId: result.entity.id }),
      }).catch((err) => console.error("[ci-entities] Auto-scrape failed:", err))
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
    const { id, name, type, description, party, state, donationIdentifiers, ballotpediaUrl, imageUrlOverride } = body

    if (!id || !name || !type) {
      return NextResponse.json({ error: "ID, name and type are required" }, { status: 400 })
    }

    const result = await updateEntity(id, name, type, description, party, state, donationIdentifiers, ballotpediaUrl)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Image URL override — admin manually specifies the correct image. We download
    // it and re-upload to our Blob storage (so we control hosting + CORS), then
    // overwrite the entity's imageUrl. Done synchronously so it wins any race
    // with the auto-scraper that may also try to set imageUrl.
    if (imageUrlOverride && result.entity) {
      try {
        const imgRes = await fetch(imageUrlOverride, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RIPTool/1.0; +https://app.rip-tool.com)",
          },
        })
        if (imgRes.ok) {
          const imgBuffer = await imgRes.arrayBuffer()
          const contentType = imgRes.headers.get("content-type") || "image/jpeg"
          const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg"
          const filename = `entity-photos/${id}-${Date.now()}.${ext}`
          const blob = await put(filename, imgBuffer, {
            access: "public",
            contentType,
          })
          await prisma.ciEntity.update({
            where: { id },
            data: { imageUrl: blob.url, imageUrlSource: "manual" },
          })
        } else {
          console.error(`[ci-entities] Image override fetch failed: ${imgRes.status}`)
        }
      } catch (imgErr) {
        console.error("[ci-entities] Image override upload failed:", imgErr)
        // Don't fail the whole request — entity update already succeeded.
      }
    }

    // Auto-trigger Ballotpedia scraper for any entity type (extractors handle missing data gracefully).
    // Skip when admin provided an image override — they're explicitly choosing a different image
    // than whatever the scraper would pick, and we don't want a race where the scraper overwrites it.
    if (ballotpediaUrl && result.entity && !imageUrlOverride) {
      const baseUrl = request.nextUrl.origin
      fetch(`${baseUrl}/api/admin/scrape-ballotpedia`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: request.headers.get("cookie") || "" },
        body: JSON.stringify({ entityId: id }),
      }).catch((err) => console.error("[ci-entities] Auto-scrape on update failed:", err))
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
