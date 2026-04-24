import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const mappings = await prisma.unsubDomainMapping.findMany({
      orderBy: [{ friendlyName: "asc" }, { domain: "asc" }],
    })

    return NextResponse.json(mappings)
  } catch (error) {
    console.error("Error fetching unsub domain mappings:", error)
    return NextResponse.json({ error: "Failed to fetch mappings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { domain, friendlyName, notes } = body

    if (!domain?.trim()) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 })
    }

    const mapping = await prisma.unsubDomainMapping.create({
      data: {
        domain: domain.trim().toLowerCase(),
        friendlyName: friendlyName?.trim() || null,
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json(mapping, { status: 201 })
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A mapping for this domain already exists" }, { status: 409 })
    }
    console.error("Error creating unsub domain mapping:", error)
    return NextResponse.json({ error: "Failed to create mapping" }, { status: 500 })
  }
}
