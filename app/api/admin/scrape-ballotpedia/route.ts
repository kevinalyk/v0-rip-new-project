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

// Shared HTML text cleaner
function cleanText(raw: string): string {
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, "")
    .replace(/\[[\w\s]*\]/g, "") // remove [source] markers
    .replace(/\s+/g, " ")
    .trim()
}

// Extract the infobox image src from Ballotpedia HTML.
// Ballotpedia uses <div class="infobox person"> with <div class="widget-row"> children.
function extractInfoboxImage(html: string): string | null {
  // Strategy 1: find div.infobox block and grab first img inside it
  const infoboxStart = html.search(/<div[^>]*class="[^"]*infobox[^"]*"/i)
  if (infoboxStart !== -1) {
    const chunk = html.slice(infoboxStart, infoboxStart + 30000)
    const imgMatch = chunk.match(/<img[^>]+src="([^"]+)"/i)
    if (imgMatch) {
      let src = imgMatch[1]
      if (src.startsWith("//")) src = "https:" + src
      if (src.startsWith("http")) {
        console.log("[v0] scrape-ballotpedia: image found via infobox div:", src)
        return src
      }
    }
  }

  // Strategy 2: widget-row containing an img (Ballotpedia photo rows)
  const widgetImgMatch = html.match(/class="[^"]*widget-row[^"]*"[^>]*>[\s\S]{0,2000}<img[^>]+src="([^"]+)"/i)
  if (widgetImgMatch) {
    let src = widgetImgMatch[1]
    if (src.startsWith("//")) src = "https:" + src
    if (src.startsWith("http")) {
      console.log("[v0] scrape-ballotpedia: image found via widget-row:", src)
      return src
    }
  }

  // Strategy 3: first plausible person photo anywhere on the page
  const allImgs = html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)
  for (const match of allImgs) {
    let src = match[1]
    if (src.startsWith("//")) src = "https:" + src
    if (!src.startsWith("http")) continue
    if (src.includes(".svg")) continue
    if (src.includes("logo") || src.includes("icon") || src.includes("flag") || src.includes("seal")) continue
    if (src.includes("/thumb/") || src.includes("upload.wikimedia") || src.includes("ballotpedia")) {
      console.log("[v0] scrape-ballotpedia: image found via page scan:", src)
      return src
    }
  }

  console.log("[v0] scrape-ballotpedia: no image found")
  return null
}

// Extract the current office/title from the Ballotpedia infobox.
// Ballotpedia infobox structure (confirmed via inspect element):
//   <div class="infobox person">
//     <div class="widget-row value-only">Aaron Gies</div>          <- name, skip
//     <div class="widget-row">...</div>                            <- photo row
//     <div class="widget-row value-only black">Democratic Party…</div>  <- party, skip
//     <div class="widget-row value-only">Candidate, U.S. House…</div>   <- OFFICE <--
//     <div class="widget-row value-only">Elections and appointments</div> <- section header, skip
function extractOffice(html: string): string | null {
  const infoboxStart = html.search(/<div[^>]*class="[^"]*infobox[^"]*"/i)
  if (infoboxStart === -1) {
    console.log("[v0] scrape-ballotpedia: no infobox div found for office extraction")
    return null
  }

  const chunk = html.slice(infoboxStart, infoboxStart + 30000)
  console.log("[v0] scrape-ballotpedia: infobox chunk (first 500 chars):", chunk.slice(0, 500))

  // Extract all widget-row div texts
  const rows = chunk.match(/<div[^>]*class="[^"]*widget-row[^"]*"[^>]*>([\s\S]*?)<\/div>/gi) || []
  console.log("[v0] scrape-ballotpedia: widget-row count:", rows.length)

  const skipPatterns = /^(elections and appointments|contact|next election|campaign website|personal website|personal facebook|personal linkedin|personal instagram|campaign facebook|campaign x|campaign instagram|see also|external|footnote|born|age|from ballotpedia)/i

  for (const row of rows) {
    const text = cleanText(row)
    console.log("[v0] scrape-ballotpedia: widget-row text:", text)
    if (!text || text.length < 8 || text.length > 150) continue
    if (skipPatterns.test(text)) continue
    if (/^\w+ \d+, \d{4}$/.test(text)) continue // pure date
    // Skip party-only labels
    if (/^(democratic|republican|independent|libertarian|green|working families)(\s*(party|,|\s))*$/i.test(text)) continue
    // Must look like an office title
    if (/candidate|representative|rep\.|senator|sen\.|house|senate|district|governor|gov\.|congress|assembly|mayor|council|secretary|attorney|treasurer|commissioner|delegate|president/i.test(text)) {
      console.log("[v0] scrape-ballotpedia: office found:", text)
      return text
    }
  }

  console.log("[v0] scrape-ballotpedia: no office found in widget rows")
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
