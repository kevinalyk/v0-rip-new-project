import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { verifyAuth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 5MB" }, { status: 400 })
    }

    const blob = await put(`announcements/${Date.now()}-${file.name}`, file, {
      access: "public",
    })

    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("Error uploading announcement image:", error)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}
