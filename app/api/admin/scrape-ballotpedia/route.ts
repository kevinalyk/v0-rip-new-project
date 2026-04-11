import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// Only run on politician-type entities
const SUPPORTED_TYPES = ["politician", "candidate", "person"]

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
  // Strategy 1: find image inside a table with class containing "infobox"
  // Use indexOf to safely walk past nested tags instead of a regex that stops at first </table>
  const infoboxStart = html.search(/<table[^>]*class="[^"]*infobox[^"]*"/i)
  if (infoboxStart !== -1) {
    // Grab a generous chunk starting from the infobox — 20KB should cover it
    const chunk = html.slice(infoboxStart, infoboxStart + 20000)
    const imgMatch = chunk.match(/<img[^>]+src="([^"]+)"/i)
    if (imgMatch) {
      let src = imgMatch[1]
      if (src.startsWith("//")) src = "https:" + src
      if (src.startsWith("http")) return src
    }
  }

  // Strategy 2: look for the wikitable personal photo pattern Ballotpedia uses
  const personalPhotoMatch = html.match(/class="[^"]*(?:photo|headshot|portrait|person-image)[^"]*"[^>]*>[\s\S]{0,500}<img[^>]+src="([^"]+)"/i)
  if (personalPhotoMatch) {
    let src = personalPhotoMatch[1]
    if (src.startsWith("//")) src = "https:" + src
    if (src.startsWith("http")) return src
  }

  // Strategy 3: first image in the page that looks like a person photo (not a logo/icon)
  const allImgs = html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)
  for (const match of allImgs) {
    let src = match[1]
    if (src.startsWith("//")) src = "https:" + src
    if (!src.startsWith("http")) continue
    // Skip tiny icons and SVGs
    if (src.includes(".svg")) continue
    if (src.includes("logo") || src.includes("icon") || src.includes("flag") || src.includes("seal")) continue
    // Ballotpedia person photos live under /thumb/ or upload.wikimedia
    if (src.includes("/thumb/") || src.includes("upload.wikimedia") || src.includes("ballotpedia")) {
      return src
    }
  }

  return null
}

// Extract the current office/title from the Ballotpedia infobox
// e.g. "Candidate, U.S. House New York District 23"
function extractOffice(html: string): string | null {
  // The infobox has a row that reads something like:
  //   <td ...>Candidate, U.S. House New York District 23</td>
  // It sits right below the image row and before "Elections and appointments"
  // Strategy: grab the infobox chunk then look for the first non-empty td text
  // that isn't a name, party, or section header.
  const infoboxStart = html.search(/<table[^>]*class="[^"]*infobox[^"]*"/i)
  if (infoboxStart === -1) return null

  const chunk = html.slice(infoboxStart, infoboxStart + 20000)

  // Strip the image row so we don't accidentally grab alt text
  const noImg = chunk.replace(/<tr[^>]*>[\s\S]*?<img[\s\S]*?<\/tr>/i, "")

  // Find all <td> cell texts
  const cells = noImg.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []
  const cleanText = (raw: string) =>
    raw
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim()

  // Section headers we want to skip
  const skipPatterns = /^(elections and appointments|contact|next election|campaign website|personal website|see also|external|footnote)/i

  for (const cell of cells) {
    const text = cleanText(cell)
    if (!text || text.length < 5 || text.length > 120) continue
    if (skipPatterns.test(text)) continue
    // Skip if it looks like just a date (e.g. "June 23, 2026")
    if (/^\w+ \d+, \d{4}$/.test(text)) continue
    // Skip pure party labels already captured elsewhere
    if (/^(democratic|republican|independent|libertarian|green)\s*(party)?$/i.test(text)) continue
    return text
  }

  return null
}

// Extract the first meaningful bio paragraph from Ballotpedia HTML
function extractBio(html: string): string | null {
  // Strip script/style/nav/table tags first so we don't pull garbage
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")

  // Scan ALL <p> tags in the document — don't try to scope to a specific div
  // because nested div regex is unreliable
  const paragraphs = clean.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || []

  const cleanText = (raw: string) =>
    raw
      .replace(/<[^>]+>/g, "")           // strip tags
      .replace(/\[\d+\]/g, "")           // [1] footnote markers
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim()

  for (const p of paragraphs) {
    const text = cleanText(p)
    // Skip short blurbs, nav-style text, and anything that looks like a caption
    if (text.length < 60) continue
    if (/^(see also|contents|navigation|retrieved|external links)/i.test(text)) continue
    // Good bio paragraphs usually name the person or mention office/political
    if (text.length > 500) {
      const truncated = text.slice(0, 500)
      const lastPeriod = truncated.lastIndexOf(".")
      return lastPeriod > 100 ? truncated.slice(0, lastPeriod + 1) : truncated + "..."
    }
    return text
  }
  return null
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

    // Extract bio, office, and image
    const bio = extractBio(html)
    const office = extractOffice(html)

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

    if (!bio && !imageUrl && !office) {
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
        ...(office && { office }),
        ballotpediaUrl,
        ballotpediaFetchedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      entityId: updated.id,
      imageUrl: updated.imageUrl,
      bio: updated.bio,
      office: updated.office,
      ballotpediaUrl: updated.ballotpediaUrl,
    })
  } catch (error) {
    console.error("[scrape-ballotpedia] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
