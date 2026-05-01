import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { enrichEntityFromBallotpedia } from "@/lib/ballotpedia-enrich"

// Convert entity name to Ballotpedia URL slug: "Abigail Spanberger" -> "Abigail_Spanberger"
function nameToBallotpediaSlug(name: string): string {
  // Remove suffixes like "Campaign", "for Congress", "for Senate", etc.
  const cleaned = name
    .replace(/\s+(campaign|for\s+(congress|senate|president|governor|house|assembly|office).*)$/i, "")
    .trim()
  // Ballotpedia uses Title_Case_With_Underscores
  return cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("_")
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only admins and super admins can run this
    if (authResult.user.role !== "admin" && authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { entityId } = await request.json()
    if (!entityId) {
      return NextResponse.json({ error: "entityId is required" }, { status: 400 })
    }

    const entity = await prisma.ciEntity.findUnique({ where: { id: entityId } })
    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 })
    }

    // Attempt to enrich any entity type; extractors will gracefully return null for unsupported entity types (like orgs)

    // Use manually set URL if available, otherwise auto-construct from name
    const slug = nameToBallotpediaSlug(entity.name)
    const ballotpediaUrl = (entity.ballotpediaUrl as string | null) || `https://ballotpedia.org/${slug}`

    const result = await enrichEntityFromBallotpedia(entityId, ballotpediaUrl)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? "Ballotpedia enrichment failed" },
        { status: result.status },
      )
    }

    if (result.warning) {
      const isEmpty = entity.type === "pac" || entity.type === "organization"
      return NextResponse.json(
        {
          success: true,
          entityId: entity.id,
          warning: isEmpty
            ? `No enrichment data extracted for ${entity.type} type (this is normal).`
            : result.warning,
          ballotpediaUrl: result.ballotpediaUrl,
          imageUrl: null,
          bio: null,
          office: null,
        },
        { status: 200 },
      )
    }

    return NextResponse.json({
      success: true,
      entityId,
      imageUrl: result.imageUrl,
      bio: result.bio,
      office: result.office,
      ballotpediaUrl: result.ballotpediaUrl,
    })
  } catch (error) {
    console.error("[scrape-ballotpedia] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
