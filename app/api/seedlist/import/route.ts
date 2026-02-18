import { NextResponse } from "next/server"
import { importSeedEmailsFromCSV } from "@/lib/seed-email-utils"
import { getAuthenticatedUser } from "@/lib/auth"
import { canClientPerformWrites } from "@/lib/seed-utils"
import prisma from "@/lib/prisma"
import fs from "fs"
import os from "os"
import path from "path"

export async function POST(request: Request) {
  try {
    // Check if user is authenticated (any authenticated user can import)
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        role: true,
        clientId: true,
      },
    })

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const isRIPEmployee = userRecord.clientId === "RIP"

    if (!isRIPEmployee && userRecord.clientId) {
      const canWrite = await canClientPerformWrites(userRecord.clientId)
      if (!canWrite) {
        return NextResponse.json(
          { error: "Your subscription is not active. Please reactivate to upload seeds." },
          { status: 403 },
        )
      }
    }

    // RIP employees (clientId === "RIP") → uploads go to master pool
    // Client users/admins (clientId !== "RIP") → uploads auto-assign to their client
    let clientName = "RIP" // Default to RIP
    const shouldLock = !isRIPEmployee // Lock client-owned seeds

    if (!isRIPEmployee && userRecord.clientId) {
      // Get the client name for non-RIP users
      const client = await prisma.client.findUnique({
        where: { id: userRecord.clientId },
        select: { name: true },
      })
      clientName = client?.name || "RIP"
    }

    // Get the form data
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Check file type
    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "File must be a CSV" }, { status: 400 })
    }

    // Save the file to a temporary location
    const tempDir = os.tmpdir()
    const filePath = path.join(tempDir, `seed-emails-${Date.now()}.csv`)

    // Convert file to buffer and write to disk
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filePath, buffer)

    const result = await importSeedEmailsFromCSV(filePath, clientName, shouldLock)

    // Clean up the temporary file
    fs.unlinkSync(filePath)

    return NextResponse.json({
      ...result,
      clientName, // Return the client name so UI knows who owns these seeds
    })
  } catch (error) {
    console.error("Error importing seed emails:", error)
    return NextResponse.json(
      { error: "Failed to import seed emails", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
