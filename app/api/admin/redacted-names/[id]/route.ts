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

// DELETE - Remove a redacted name
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await verifyAdmin()
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params

    await prisma.redactedName.delete({
      where: { id },
    })

    // Clear the redaction cache so ingestion stops redacting this name
    clearRedactionCache()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting redacted name:", error)
    return NextResponse.json({ error: "Failed to delete redacted name" }, { status: 500 })
  }
}
