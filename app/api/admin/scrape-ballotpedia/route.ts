import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// Only run on politician-type entities
const SUPPORTED_TYPES = ["politician", "candidate"]

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

// Extract the infobox image src from Ballotpedia HTML
function extractInfoboxImage(html: string): string | null {
  // Ballotpedia infobox image is inside a table.infobox, look for the first img
  const infoboxMatch = html.match(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
  if (!infoboxMatch) return null

  const imgMatch = infoboxMatch[1].match(/<img[^>]+src="([^"]+)"/i)
  if (!imgMatch) return null

  let src = imgMatch[1]
  // Make absolute if needed
  if (src.startsWith("//")) src = "https:" + src
  if (!src.startsWith("http")) return null

  return src
}

// Extract the first meaningful bio paragraph from Ballotpedia HTML
function extractBio(html: string): string | null {
  // Strip script/style tags first
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")

  // Find the main content div
  const contentMatch = clean.match(/<div[^>]*id="mw-content-text"[^>]*>([\s\S]*?)<\/div>/i)
  const body = contentMatch ? contentMatch[1] : clean

  // Get all <p> tags, strip HTML, find the first one with real content
  const paragraphs = body.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || []
  for (const p of paragraphs) {
    const text = p
      .replace(/<[^>]+>/g, "")
      .replace(/\[\d+\]/g, "") // remove footnote markers like [1]
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&#\d+;/g, "")
      .trim()
    if (text.length > 80) {
      // Truncate to ~500 chars at a sentence boundary
      if (text.length > 500) {
        const truncated = text.slice(0, 500)
        const lastPeriod = truncated.lastIndexOf(".")
        return lastPeriod > 100 ? truncated.slice(0, lastPeriod + 1) : truncated + "..."
      }
      return text
    }
  }
  return null
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Only super admins can run this
    if (authResult.user.role !== "admin") {
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

    // Only supported types
    if (!SUPPORTED_TYPES.includes(entity.type)) {
      return NextResponse.json(
        { error: `Ballotpedia enrichment is only supported for politician/candidate entities (got: ${entity.type})` },
        { status: 400 }
      )
    }

    // Use manually set URL if available, otherwise auto-construct from name
    const slug = nameToBallotpediaSlug(entity.name)
    const ballotpediaUrl = (entity.ballotpediaUrl as string | null) || `https://ballotpedia.org/${slug}`

    // Fetch Ballotpedia page
    const res = await fetch(ballotpediaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RIPTool/1.0; +https://app.rip-tool.com)",
        Accept: "text/html",
      },
    })

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json(
          { error: `No Ballotpedia page found for "${entity.name}" (tried: ${ballotpediaUrl})` },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: `Ballotpedia returned ${res.status} for ${ballotpediaUrl}` },
        { status: 502 }
      )
    }

    const html = await res.text()

    // Extract bio
    const bio = extractBio(html)

    // Extract and upload image
    let imageUrl: string | null = null
    const imageSrc = extractInfoboxImage(html)

    if (imageSrc) {
      try {
        const imgRes = await fetch(imageSrc, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; RIPTool/1.0; +https://app.rip-tool.com)",
            Referer: ballotpediaUrl,
          },
        })

        if (imgRes.ok) {
          const imgBuffer = await imgRes.arrayBuffer()
          const contentType = imgRes.headers.get("content-type") || "image/jpeg"
          const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg"
          const filename = `entity-photos/${entityId}-${Date.now()}.${ext}`

          const blob = await put(filename, imgBuffer, {
            access: "public",
            contentType,
          })
          imageUrl = blob.url
        }
      } catch (imgErr) {
        console.error("[scrape-ballotpedia] Image upload failed:", imgErr)
        // Continue without image — don't fail the whole request
      }
    }

    if (!bio && !imageUrl) {
      return NextResponse.json(
        {
          error: `Found the Ballotpedia page but could not extract any usable data. The page structure may be different for this entity.`,
          ballotpediaUrl,
        },
        { status: 422 }
      )
    }

    // Save to DB
    const updated = await prisma.ciEntity.update({
      where: { id: entityId },
      data: {
        ...(imageUrl && { imageUrl }),
        ...(bio && { bio }),
        ballotpediaUrl,
        ballotpediaFetchedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      entityId: updated.id,
      imageUrl: updated.imageUrl,
      bio: updated.bio,
      ballotpediaUrl: updated.ballotpediaUrl,
    })
  } catch (error) {
    console.error("[scrape-ballotpedia] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
