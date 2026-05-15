import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"

// Slugify a title into a URL-safe string
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .slice(0, 100)
}

// Make a slug unique by appending -2, -3, etc. if needed
async function uniqueSlug(base: string): Promise<string> {
  let slug = base
  let attempt = 1
  while (true) {
    const existing = await prisma.digestArticle.findUnique({ where: { slug } })
    if (!existing) return slug
    attempt++
    slug = `${base}-${attempt}`
  }
}

export async function POST(request: NextRequest) {
  try {
    // --- Bearer token auth ---
    const authHeader = request.headers.get("authorization") ?? ""
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
    const expectedToken = process.env.DIGEST_API_KEY

    if (!expectedToken) {
      console.error("[Digest API] DIGEST_API_KEY env var not set")
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
    }

    if (!token || token !== expectedToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // --- Parse body ---
    const body = await request.json()

    const {
      title,
      summary,
      body: articleBody,
      imageBase64,
      imageUrl: providedImageUrl,
      imageFilename,
      sources,
      tags,
      publishedAt,
      slug: providedSlug,
    } = body

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "title is required" }, { status: 400 })
    }
    if (!articleBody || typeof articleBody !== "string") {
      return NextResponse.json({ error: "body (HTML) is required" }, { status: 400 })
    }

    // Sanitize <a> tags in the body:
    // - Internal links (starting with /) get no target/rel changes
    // - External links get target="_blank" rel="noopener noreferrer"
    // - Strip any javascript: or data: hrefs for safety
    const sanitizedBody = articleBody.replace(
      /<a\s([^>]*)>/gi,
      (_match, attrs: string) => {
        const hrefMatch = attrs.match(/href=["']([^"']*)["']/i)
        const href = hrefMatch?.[1] ?? ""
        // Block dangerous protocols
        if (/^(javascript|data|vbscript):/i.test(href.trim())) {
          return `<a href="#"`
        }
        const isInternal = href.startsWith("/") || href.startsWith("#")
        const targetRel = isInternal ? "" : ` target="_blank" rel="noopener noreferrer"`
        // Rebuild with only href (strip any onclick or other event attrs for safety)
        return `<a href="${href}"${targetRel}>`
      }
    )

    // --- Handle image ---
    let imageUrl: string | null = providedImageUrl ?? null

    if (imageBase64 && !imageUrl) {
      // Decode base64 and upload to Vercel Blob
      const matches = imageBase64.match(/^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/)
      const mimeType = matches?.[1] ?? "image/jpeg"
      const base64Data = matches?.[2] ?? imageBase64
      const buffer = Buffer.from(base64Data, "base64")
      const filename = imageFilename ?? `digest-${Date.now()}.jpg`

      const blob = await put(`digest/${filename}`, buffer, {
        access: "public",
        contentType: mimeType,
      })
      imageUrl = blob.url
    }

    // --- Slug ---
    const baseSlug = providedSlug ? slugify(providedSlug) : slugify(title)
    const slug = await uniqueSlug(baseSlug)

    // --- Validate sources / tags shapes ---
    const validatedSources = Array.isArray(sources) ? sources : null
    const validatedTags = Array.isArray(tags) ? tags : null

    // --- Create record ---
    const article = await prisma.digestArticle.create({
      data: {
        slug,
        title: title.trim(),
        summary: summary?.trim() ?? null,
        body: sanitizedBody,
        imageUrl,
        sources: validatedSources,
        tags: validatedTags,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        createdBy: "claude",
      },
    })

    return NextResponse.json(
      {
        id: article.id,
        slug: article.slug,
        url: `https://app.rip-tool.com/digest/${article.slug}`,
        publishedAt: article.publishedAt,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[Digest API] Error creating article:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET — list recent articles (for quick health check / Claude to verify)
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  const expectedToken = process.env.DIGEST_API_KEY

  if (!expectedToken || !token || token !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const articles = await prisma.digestArticle.findMany({
    orderBy: { publishedAt: "desc" },
    take: 20,
    select: { id: true, slug: true, title: true, publishedAt: true },
  })

  return NextResponse.json({ articles })
}
