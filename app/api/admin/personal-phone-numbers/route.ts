import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { verifyAuth } from "@/lib/auth"

const prisma = new PrismaClient()

export async function GET(request: Request) {
  const auth = await verifyAuth(request)
  if (!auth || auth.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
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
    console.error("Error fetching personal phone numbers:", error)
    return NextResponse.json({ error: "Failed to fetch phone numbers" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await verifyAuth(request)
  if (!auth || auth.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  try {
    const body = await request.json()
    const { phoneNumber, clientId } = body

    if (!phoneNumber || !clientId) {
      return NextResponse.json({ error: "Phone number and client ID are required" }, { status: 400 })
    }

    // Normalize phone number - remove non-digits
    const normalizedPhone = phoneNumber.replace(/\D/g, "")

    // Check if phone number already exists
    const existing = await prisma.personalPhoneNumber.findUnique({
      where: { phoneNumber: normalizedPhone },
    })

    if (existing) {
      return NextResponse.json({ error: "Phone number already assigned" }, { status: 400 })
    }

    // Verify client exists
    const client = await prisma.client.findUnique({
      where: { id: clientId },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    const newPhoneNumber = await prisma.personalPhoneNumber.create({
      data: {
        phoneNumber: normalizedPhone,
        clientId,
        assignedBy: auth.email || auth.userId,
      },
      include: {
        client: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    return NextResponse.json({ phoneNumber: newPhoneNumber })
  } catch (error) {
    console.error("Error creating personal phone number:", error)
    return NextResponse.json({ error: "Failed to create phone number" }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const auth = await verifyAuth(request)
  if (!auth || auth.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json({ error: "Phone number ID is required" }, { status: 400 })
    }

    await prisma.personalPhoneNumber.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting personal phone number:", error)
    return NextResponse.json({ error: "Failed to delete phone number" }, { status: 500 })
  }
}
