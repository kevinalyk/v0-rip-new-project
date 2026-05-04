import { put, del } from "@vercel/blob"
import { createHash } from "crypto"
import prisma from "@/lib/prisma"

// Known Ballotpedia placeholder image SHA-256 hashes. When the infobox image
// matches one of these, the candidate doesn't have a real headshot on file —
// Ballotpedia is just showing the "Submit a photo" silhouette or their BP
// initials logo. We treat these as "no image yet" so a future scrape can
// replace them once a real photo lands.
//
// Hashes confirmed byte-identical between the original Ballotpedia source and
// our existing Blob copies on 2026-05-03.
//   1. https://ballotpedia.s3.us-east-1.amazonaws.com/images/thumb/6/68/SubmitPhoto-150px.png
//   2. https://cdn.ballotpedia.org/images/thumb/0/0c/BP-Initials-UPDATED.png/40px-BP-Initials-UPDATED.png
//
// To add new placeholders later, sha256sum the file and append the hex digest.
export const PLACEHOLDER_IMAGE_HASHES: ReadonlySet<string> = new Set([
  "e33a3211454a40f209c7f7dd198845c72cc4cf94eac10be3cd138927e3dce021", // SUBMIT PHOTO silhouette
  "1603c8f12b657b66db7b5c9805fb31e17312a94d5341205c9ee2b4951f60db57", // BP initials logo
])

export function sha256Hex(buffer: ArrayBuffer | Buffer): string {
  const buf = buffer instanceof ArrayBuffer ? Buffer.from(buffer) : buffer
  return createHash("sha256").update(buf).digest("hex")
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
  // Pull the current image state up front — needed both to short-circuit if
  // the entity already has a locked photo and to clean up the old Blob when
  // we replace a placeholder with a real image.
  const existing = await prisma.ciEntity.findUnique({
    where: { id: entityId },
    select: { imageUrl: true, imageUrlSource: true },
  })

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
  // the entity as having a manually-curated or already-locked image (refresh
  // cron path).
  let imageUrl: string | null = null
  // True when we fetched an image but it matched a known placeholder hash —
  // we deliberately don't store it but DO want to flag the entity so the
  // refresh cron knows to re-check next cycle.
  let imageWasPlaceholder = false
  // If we successfully upload a NEW real image, the old Blob (if any) needs
  // to be deleted. We capture the URL to delete here and call del() AFTER the
  // DB update succeeds, so a partial failure can never leave us with an
  // entity pointing at a deleted Blob.
  let oldImageUrlToDelete: string | null = null
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
        const hash = sha256Hex(imgBuffer)

        if (PLACEHOLDER_IMAGE_HASHES.has(hash)) {
          // Ballotpedia is serving us their "no photo on file" placeholder.
          // Don't waste Blob storage on it.
          imageWasPlaceholder = true
        } else {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg"
          const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg"
          const filename = `entity-photos/${entityId}-${Date.now()}.${ext}`

          const blob = await put(filename, imgBuffer, {
            access: "public",
            contentType,
          })
          imageUrl = blob.url

          // Schedule the previous Blob (if any) for deletion. We never delete
          // a manually-uploaded image — those are sacred. We also won't reach
          // this branch when the existing source is 'ballotpedia' because the
          // refresh cron sets skipImage=true in that case; but we double-check
          // here so a manual admin re-scrape can't accidentally orphan a
          // manual photo.
          if (existing?.imageUrl && existing.imageUrlSource !== "manual") {
            oldImageUrlToDelete = existing.imageUrl
          }
        }
      }
    } catch (imgErr) {
      console.error("[ballotpedia-enrich] Image upload failed:", imgErr)
      // Continue without image — don't fail the whole request
    }
  }

  // If we got nothing useful, still record the URL + fetch timestamp so we
  // don't keep retrying. Also flag a placeholder hit when we got one — that
  // way the cron will re-check next cycle. We never downgrade an existing
  // 'ballotpedia' (real) or 'manual' source to 'placeholder'.
  if (!bio && !imageUrl && !office) {
    const canFlagPlaceholder =
      imageWasPlaceholder &&
      (!existing?.imageUrlSource || existing.imageUrlSource === "ballotpedia-placeholder")

    await prisma.ciEntity.update({
      where: { id: entityId },
      data: {
        ballotpediaUrl,
        ballotpediaFetchedAt: new Date(),
        ...(canFlagPlaceholder && { imageUrlSource: "ballotpedia-placeholder" }),
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
  // partial data doesn't wipe out manually-curated values. The image source
  // logic:
  //   - Real image stored → imageUrlSource='ballotpedia' (locks the photo)
  //   - Placeholder detected & current source allows downgrade → 'ballotpedia-placeholder'
  //   - Otherwise → don't touch imageUrlSource
  const canFlagPlaceholder =
    !imageUrl &&
    imageWasPlaceholder &&
    (!existing?.imageUrlSource || existing.imageUrlSource === "ballotpedia-placeholder")

  await prisma.ciEntity.update({
    where: { id: entityId },
    data: {
      ...(imageUrl && { imageUrl, imageUrlSource: "ballotpedia" }),
      ...(canFlagPlaceholder && { imageUrlSource: "ballotpedia-placeholder" }),
      ...(bio && { bio }),
      ...(office && { office }),
      ballotpediaUrl,
      ballotpediaFetchedAt: new Date(),
    },
  })

  // DB write succeeded — now safe to delete the old Blob. If this fails we
  // just leak a Blob (cosmetic, not correctness) so we swallow the error.
  if (oldImageUrlToDelete) {
    await del(oldImageUrlToDelete).catch((err) =>
      console.error("[ballotpedia-enrich] Failed to delete old Blob:", oldImageUrlToDelete, err),
    )
  }

  return {
    success: true,
    status: 200,
    bio,
    office,
    imageUrl,
    ballotpediaUrl,
  }
}
