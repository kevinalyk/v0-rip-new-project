import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: Request) {
  const authResult = await verifyAuth(request)
  if (!authResult.success || authResult.user?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const domains = await prisma.personalEmailDomain.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      client: { select: { id: true, name: true, slug: true } },
    },
  })

  return NextResponse.json({ domains })
}

export async function POST(request: Request) {
  const authResult = await verifyAuth(request)
  if (!authResult.success || authResult.user?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { domain, clientId, useSlug } = await request.json()

  if (!domain || !clientId) {
    return NextResponse.json({ error: "domain and clientId are required" }, { status: 400 })
  }

  const normalized = domain.trim().toLowerCase()

  const existing = await prisma.personalEmailDomain.findUnique({ where: { domain: normalized } })
  if (existing) {
    return NextResponse.json({ error: `Domain "${normalized}" is already registered` }, { status: 409 })
  }

  const record = await prisma.personalEmailDomain.create({
    data: {
      domain: normalized,
      clientId,
      useSlug: useSlug ?? true,
      addedBy: authResult.user?.email ?? "admin",
    },
    include: { client: { select: { id: true, name: true, slug: true } } },
  })

  return NextResponse.json({ domain: record })
}

export async function DELETE(request: Request) {
  const authResult = await verifyAuth(request)
  if (!authResult.success || authResult.user?.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 })

  await prisma.personalEmailDomain.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
