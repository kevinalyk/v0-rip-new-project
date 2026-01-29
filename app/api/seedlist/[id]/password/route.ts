import { NextResponse } from "next/server"
import { isAuthenticated } from "@/lib/auth"
import { decrypt } from "@/lib/encryption"
import prisma from "@/lib/prisma"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    // Check if user is authenticated
    const isAuth = await isAuthenticated(request)
    if (!isAuth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const id = params.id

    // Get the seed email from the database
    const seedEmail = await prisma.seedEmail.findUnique({
      where: { id },
    })

    if (!seedEmail) {
      return NextResponse.json({ error: "Seed email not found" }, { status: 404 })
    }

    // Decrypt the password
    const password =
      seedEmail.twoFactorEnabled && seedEmail.appPassword ? decrypt(seedEmail.appPassword) : decrypt(seedEmail.password)

    // Return the decrypted password
    return NextResponse.json({
      encrypted: seedEmail.password,
      decrypted: password,
    })
  } catch (error) {
    console.error("Error fetching password:", error)
    return NextResponse.json(
      { error: "Failed to fetch password", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
