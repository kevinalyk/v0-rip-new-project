import { NextResponse } from "next/server"
import { exec } from "child_process"
import { isAdmin } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    // Check if user is admin
    const isUserAdmin = await isAdmin(request)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Unauthorized - Admin access required" }, { status: 403 })
    }

    console.log("Starting schema update process...")

    // Run prisma db push
    const updatePromise = new Promise((resolve, reject) => {
      exec("npx prisma db push", (error, stdout, stderr) => {
        if (error) {
          console.error(`Error: ${error.message}`)
          reject(error)
          return
        }

        console.log(`Schema update output: ${stdout}`)
        if (stderr) {
          console.error(`Schema update errors: ${stderr}`)
        }

        resolve({ stdout, stderr })
      })
    })

    // Wait for the command to complete with a timeout
    const result = await Promise.race([
      updatePromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Schema update timed out")), 30000)),
    ])

    return NextResponse.json({
      success: true,
      message: "Schema update completed",
      result,
    })
  } catch (error) {
    console.error("Schema update failed:", error)
    return NextResponse.json(
      {
        error: "Failed to update schema",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
