import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

// GET /api/admin/changelog — list all entries, newest first
export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user || user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const entries = await prisma.changelog.findMany({
      orderBy: { publishedAt: "desc" },
    })

    return NextResponse.json({ entries })
  } catch (error) {
    console.error("[changelog] GET error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/admin/changelog — create a new entry
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user || user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { title, description, category, plan, publishedAt } = body

    if (!title?.trim() || !description?.trim() || !category?.trim()) {
      return NextResponse.json({ error: "title, description, and category are required" }, { status: 400 })
    }

    const entry = await prisma.changelog.create({
      data: {
        id: `cl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        title: title.trim(),
        description: description.trim(),
        category: category.trim(),
        plan: plan?.trim() || null,
        publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
        createdBy: user.id as string,
      },
    })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (error) {
    console.error("[changelog] POST error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
