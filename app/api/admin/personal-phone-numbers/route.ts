import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { PrismaClient } from "@prisma/client"
import { verifyAuth } from "@/lib/auth"

const prisma = new PrismaClient()

// GET - List all personal phone numbers
export async function GET(request: NextRequest) {
  const user = await verifyAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const phoneNumbers = await prisma.personalPhoneNumber.findMany({
      include: {
        client: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json({ phoneNumbers })
  } catch (error) {
    console.error("[personal-phone-numbers] Error fetching:", error)
    return NextResponse.json({ error: "Failed to fetch phone numbers" }, { status: 500 })
  }
}

// POST - Add a new personal phone number
export async function POST(request: NextRequest) {
  const user = await verifyAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { phoneNumber, clientId } = body

    if (!phoneNumber || !clientId) {
      return NextResponse.json({ error: "Phone number and client are required" }, { status: 400 })
    }

    // Normalize phone number - strip non-digits, ensure no leading +
    const normalized = phoneNumber.replace(/\D/g, "")

    // Check if client exists
    const client = await prisma.client.findUnique({ where: { id: clientId } })
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    // Check if phone number already exists
    const existing = await prisma.personalPhoneNumber.findUnique({
      where: { phoneNumber: normalized },
    })
    if (existing) {
      return NextResponse.json({ error: "Phone number already registered" }, { status: 409 })
    }

    const newPhone = await prisma.personalPhoneNumber.create({
      data: {
        phoneNumber: normalized,
        clientId,
        assignedBy: user.email || user.name || null,
      },
      include: {
        client: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    return NextResponse.json({ phoneNumber: newPhone }, { status: 201 })
  } catch (error) {
    console.error("[personal-phone-numbers] Error creating:", error)
    return NextResponse.json({ error: "Failed to add phone number" }, { status: 500 })
  }
}

// DELETE - Remove a personal phone number
export async function DELETE(request: NextRequest) {
  const user = await verifyAuth(request)
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 })
    }

    await prisma.personalPhoneNumber.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[personal-phone-numbers] Error deleting:", error)
    return NextResponse.json({ error: "Failed to delete phone number" }, { status: 500 })
  }
}
