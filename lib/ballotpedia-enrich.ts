import { put } from "@vercel/blob"
import prisma from "@/lib/prisma"

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
export function extractInfoboxImage(html: string): string | null {
  const infoboxStart = html.search(/<div[^>]*class="[^"]*infobox[^"]*"/i)
  if (infoboxStart !== -1) {
    const chunk = html.slice(infoboxStart, infoboxStart + 30000)
    const imgMatch = chunk.match(/<img[^>]+src="([^"]+)"/i)
    if (imgMatch) {
      let src = imgMatch[1]
      if (src.startsWith("//")) src = "https:" + src
      if (src.startsWith("http")) return src
    }
  }

  const widgetImgMatch = html.match(/class="[^"]*widget-row[^"]*"[^>]*>[\s\S]{0,2000}<img[^>]+src="([^"]+)"/i)
  if (widgetImgMatch) {
    let src = widgetImgMatch[1]
    if (src.startsWith("//")) src = "https:" + src
    if (src.startsWith("http")) return src
  }

  const allImgs = html.matchAll(/<img[^>]+src="([^"]+)"[^>]*>/gi)
  for (const match of allImgs) {
    let src = match[1]
    if (src.startsWith("//")) src = "https:" + src
    if (!src.startsWith("http")) continue
    if (src.includes(".svg")) continue
    if (src.includes("logo") || src.includes("icon") || src.includes("flag") || src.includes("seal")) continue
    if (src.includes("/thumb/") || src.includes("upload.wikimedia") || src.includes("ballotpedia")) {
      return src
    }
  }

  return null
}

// Extract the current office/title from the Ballotpedia infobox.
export function extractOffice(html: string): string | null {
  const infoboxStart = html.search(/<div[^>]*class="[^"]*infobox[^"]*"/i)
  if (infoboxStart === -1) return null

  const chunk = html.slice(infoboxStart, infoboxStart + 30000)
  const rows = chunk.match(/<div[^>]*class="[^"]*widget-row[^"]*"[^>]*>([\s\S]*?)<\/div>/gi) || []

  const skipPatterns =
    /^(elections and appointments|contact|next election|campaign website|personal website|personal facebook|personal linkedin|personal instagram|campaign facebook|campaign x|campaign instagram|see also|external|footnote|born|age|from ballotpedia)/i

  for (const row of rows) {
    const text = cleanText(row)
    if (!text || text.length < 8 || text.length > 150) continue
    if (skipPatterns.test(text)) continue
    if (/^\w+ \d+, \d{4}$/.test(text)) continue
    if (/^(democratic|republican|independent|libertarian|green|working families)(\s*(party|,|\s))*$/i.test(text)) continue
    if (
      /candidate|representative|rep\.|senator|sen\.|house|senate|district|governor|gov\.|congress|assembly|mayor|council|secretary|attorney|treasurer|commissioner|delegate|president/i.test(
        text,
      )
    ) {
      return text
    }
  }

  return null
}

// Extract the first meaningful bio paragraph from Ballotpedia HTML
export function extractBio(html: string): string | null {
  const clean = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")

  const paragraphs = clean.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || []

  const cleanParagraph = (raw: string) =>
    raw
      .replace(/<[^>]+>/g, "")
      .replace(/\[\d+\]/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#\d+;/g, "")
      .replace(/\s+/g, " ")
      .trim()

  for (const p of paragraphs) {
    const text = cleanParagraph(p)
    if (text.length < 60) continue
    if (/^(see also|contents|navigation|retrieved|external links)/i.test(text)) continue
    if (text.length > 500) {
      const truncated = text.slice(0, 500)
      const lastPeriod = truncated.lastIndexOf(".")
      return lastPeriod > 100 ? truncated.slice(0, lastPeriod + 1) : truncated + "..."
    }
    return text
  }
  return null
}

export type EnrichResult = {
  success: boolean
  status: number
  bio: string | null
  office: string | null
  imageUrl: string | null
  ballotpediaUrl: string
  warning?: string
  error?: string
}

// Fetch a Ballotpedia page, extract bio/office/image, upload image to Blob,
// and persist all of it on the entity. Used by the admin POST endpoint, the
// FEC cron auto-enrichment flow, and the weekly ballotpedia-refresh cron.
//
// Options:
//   - prefetchedHtml: skip the HTTP fetch and use this HTML instead (used by
//     the FEC cron, which already has the page body in hand).
//   - skipImage: never touch the image (extract, upload, or save). Set by the
//     refresh cron when the entity has imageUrlSource='manual', so we don't
//     clobber a manually-curated image.
//   - touchTimestampOnFailure: if the fetch fails, still update
//     ballotpediaFetchedAt so the failed entity rotates to the back of the
//     refresh queue instead of being retried every day. Set by the refresh
//     cron; not set by admin scrapes (which want the user to see/retry the
//     error immediately).
export async function enrichEntityFromBallotpedia(
  entityId: string,
  ballotpediaUrl: string,
  options: {
    prefetchedHtml?: string
    skipImage?: boolean
    touchTimestampOnFailure?: boolean
  } = {},
): Promise<EnrichResult> {
  let html: string

  if (options.prefetchedHtml) {
    html = options.prefetchedHtml
  } else {
    const res = await fetch(ballotpediaUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; RIPTool/1.0; +https://app.rip-tool.com)",
        Accept: "text/html",
      },
    })

    if (!res.ok) {
      // For background refreshes, mark the entity as "tried" so a permanently
      // broken URL doesn't camp at the front of the queue forever. For admin
      // scrapes we leave the timestamp alone so retries keep working naturally.
      if (options.touchTimestampOnFailure) {
        await prisma.ciEntity
          .update({
            where: { id: entityId },
            data: { ballotpediaFetchedAt: new Date() },
          })
          .catch((err) => console.error("[ballotpedia-enrich] Failed to touch timestamp:", err))
      }

      return {
        success: false,
        status: res.status === 404 ? 404 : 502,
        bio: null,
        office: null,
        imageUrl: null,
        ballotpediaUrl,
        error:
          res.status === 404
            ? `No Ballotpedia page found at ${ballotpediaUrl}`
            : `Ballotpedia returned ${res.status} for ${ballotpediaUrl}`,
      }
    }

    html = await res.text()
  }

  const bio = extractBio(html)
  const office = extractOffice(html)

  // Extract and upload image — skipped entirely when the caller has flagged
  // the entity as having a manually-curated image (refresh cron path).
  let imageUrl: string | null = null
  const imageSrc = options.skipImage ? null : extractInfoboxImage(html)

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
      console.error("[ballotpedia-enrich] Image upload failed:", imgErr)
      // Continue without image — don't fail the whole request
    }
  }

  // If we got nothing useful, still record the URL + fetch timestamp so we
  // don't keep retrying. Surface a warning the caller can show.
  if (!bio && !imageUrl && !office) {
    await prisma.ciEntity.update({
      where: { id: entityId },
      data: {
        ballotpediaUrl,
        ballotpediaFetchedAt: new Date(),
      },
    })

    return {
      success: true,
      status: 200,
      bio: null,
      office: null,
      imageUrl: null,
      ballotpediaUrl,
      warning: "Found the Ballotpedia page but could not extract any usable data.",
    }
  }

  // Save what we got. We only overwrite fields we successfully extracted, so
  // partial data doesn't wipe out manually-curated values. Whenever we DO
  // write a new imageUrl, also stamp imageUrlSource='ballotpedia' so the
  // weekly refresh cron knows it can replace the image on the next run.
  await prisma.ciEntity.update({
    where: { id: entityId },
    data: {
      ...(imageUrl && { imageUrl, imageUrlSource: "ballotpedia" }),
      ...(bio && { bio }),
      ...(office && { office }),
      ballotpediaUrl,
      ballotpediaFetchedAt: new Date(),
    },
  })

  return {
    success: true,
    status: 200,
    bio,
    office,
    imageUrl,
    ballotpediaUrl,
  }
}
