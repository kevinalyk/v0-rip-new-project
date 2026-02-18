import { NextResponse } from "next/server"
import { exportSeedEmailsToCSV } from "@/lib/seed-email-utils"
import { getAuthenticatedUser } from "@/lib/auth"
import fs from "fs"
import os from "os"
import path from "path"

export async function GET(request: Request) {
  try {
    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // For now, all authenticated users can export seedlist
    // TODO: Add domain-specific filtering when requirements are clarified

    // Create a temporary file
    const tempDir = os.tmpdir()
    const filePath = path.join(tempDir, `seed-emails-export-${Date.now()}.csv`)

    // Export the seed emails
    const result = await exportSeedEmailsToCSV(filePath)

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    // Read the file
    const fileBuffer = fs.readFileSync(filePath)

    // Clean up the temporary file
    fs.unlinkSync(filePath)

    // Return the file as a download
    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="rip-seed-emails-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    })
  } catch (error) {
    console.error("Error exporting seed emails:", error)
    return NextResponse.json(
      { error: "Failed to export seed emails", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
