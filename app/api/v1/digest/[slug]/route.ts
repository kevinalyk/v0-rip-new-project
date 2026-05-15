import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { prisma } from "@/lib/prisma"

function bearerAuth(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization") ?? ""
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null
  const expectedToken = process.env.DIGEST_API_KEY
  return !!(expectedToken && token && token === expectedToken)
}

// PATCH /api/v1/digest/[slug] — partial update of an existing article
export async function PATCH(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!bearerAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { slug } = params

  const existing = await prisma.digestArticle.findUnique({ where: { slug } })
  if (!existing) {
    return NextResponse.json({ error: `No article found with slug "${slug}"` }, { status: 404 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const {
    title,
    summary,
    body: articleBody,
    imageBase64,
    imageFilename,
    imageUrl: providedImageUrl,
    sources,
    tags,
    publishedAt,
  } = body as Record<string, unknown>

  // Build update payload — only include fields that were provided
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: Record<string, any> = {}

  if (title !== undefined) data.title = String(title).trim()
  if (summary !== undefined) data.summary = summary === null ? null : String(summary).trim()
  if (articleBody !== undefined) data.body = String(articleBody)
  if (sources !== undefined) data.sources = Array.isArray(sources) ? sources : null
  if (tags !== undefined) data.tags = Array.isArray(tags) ? tags : null
  if (publishedAt !== undefined) data.publishedAt = new Date(String(publishedAt))

  // Handle image — base64 takes priority over plain URL
  if (imageBase64) {
    const matches = String(imageBase64).match(
      /^data:([a-zA-Z0-9+/]+\/[a-zA-Z0-9+/]+);base64,(.+)$/,
    )
    const mimeType = matches?.[1] ?? "image/jpeg"
    const base64Data = matches?.[2] ?? String(imageBase64)
    const buffer = Buffer.from(base64Data, "base64")
    const filename = imageFilename ? String(imageFilename) : `digest-${Date.now()}.jpg`

    const blob = await put(`digest/${filename}`, buffer, {
      access: "public",
      contentType: mimeType,
    })
    data.imageUrl = blob.url
  } else if (providedImageUrl !== undefined) {
    data.imageUrl = providedImageUrl === null ? null : String(providedImageUrl)
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No fields provided to update" }, { status: 400 })
  }

  const updated = await prisma.digestArticle.update({
    where: { slug },
    data,
  })

  return NextResponse.json({
    id: updated.id,
    slug: updated.slug,
    url: `https://app.rip-tool.com/digest/${updated.slug}`,
    updatedAt: updated.updatedAt,
  })
}

// GET /api/v1/digest/[slug] — fetch a single article (for Claude to verify state)
export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (!bearerAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const article = await prisma.digestArticle.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      body: true,
      imageUrl: true,
      sources: true,
      tags: true,
      publishedAt: true,
      updatedAt: true,
    },
  })

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(article)
}
