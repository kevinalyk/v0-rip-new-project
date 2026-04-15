import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { verifyAuth } from "@/lib/auth"

const prisma = new PrismaClient()

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const mappings = await prisma.dkimSenderMapping.findMany({
      orderBy: { selectorValue: "asc" },
    })

    return NextResponse.json(mappings)
  } catch (error) {
    console.error("Error fetching DKIM mappings:", error)
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
    const { selectorValue, friendlyName, notes } = body

    if (!selectorValue?.trim() || !friendlyName?.trim()) {
      return NextResponse.json({ error: "Selector value and friendly name are required" }, { status: 400 })
    }

    const mapping = await prisma.dkimSenderMapping.create({
      data: {
        selectorValue: selectorValue.trim().toLowerCase(),
        friendlyName: friendlyName.trim(),
        notes: notes?.trim() || null,
      },
    })

    return NextResponse.json(mapping, { status: 201 })
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A mapping for this selector already exists" }, { status: 409 })
    }
    console.error("Error creating DKIM mapping:", error)
    return NextResponse.json({ error: "Failed to create mapping" }, { status: 500 })
  }
}
