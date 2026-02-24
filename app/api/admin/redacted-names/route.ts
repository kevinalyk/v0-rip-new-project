import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"
import { clearRedactionCache } from "@/lib/redaction-utils"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key")

async function verifyAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth_token")?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (payload.role !== "super_admin") return null
    return payload
  } catch {
    return null
  }
}

// GET - Fetch all redacted names
export async function GET() {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const names = await prisma.redactedName.findMany({
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(names)
  } catch (error) {
    console.error("Error fetching redacted names:", error)
    return NextResponse.json({ error: "Failed to fetch redacted names" }, { status: 500 })
  }
}

// POST - Add a new redacted name
export async function POST(request: Request) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { name } = await request.json()

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const trimmedName = name.trim()

    // Check if already exists
    const existing = await prisma.redactedName.findUnique({
      where: { name: trimmedName },
    })

    if (existing) {
      return NextResponse.json({ error: "This name is already in the redaction list" }, { status: 409 })
    }

    const redactedName = await prisma.redactedName.create({
      data: {
        name: trimmedName,
        addedBy: admin.email as string || "admin",
      },
    })

    // Clear the redaction cache so new ingestion picks up the name immediately
    clearRedactionCache()

    return NextResponse.json(redactedName)
  } catch (error) {
    console.error("Error adding redacted name:", error)
    return NextResponse.json({ error: "Failed to add redacted name" }, { status: 500 })
  }
}
