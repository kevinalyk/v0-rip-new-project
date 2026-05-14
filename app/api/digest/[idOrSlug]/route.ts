import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

interface Params {
  params: { idOrSlug: string }
}

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { idOrSlug } = params
    // Try slug first, then id
    const article = await prisma.digestArticle.findFirst({
      where: { OR: [{ slug: idOrSlug }, { id: idOrSlug }] },
    })

    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      ...article,
      sources: Array.isArray(article.sources) ? article.sources : null,
      tags: Array.isArray(article.tags) ? article.tags : null,
      publishedAt: article.publishedAt.toISOString(),
      updatedAt: article.updatedAt.toISOString(),
    })
  } catch (err) {
    console.error("[Digest GET] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await verifyAuth(request)
    if (!auth || auth.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { idOrSlug } = params
    const article = await prisma.digestArticle.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    })

    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 })

    await prisma.digestArticle.delete({ where: { id: article.id } })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[Digest DELETE] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
