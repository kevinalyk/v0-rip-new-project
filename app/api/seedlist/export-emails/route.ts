import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

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

    // Get query parameters
    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get("clientSlug")

    if (!clientSlug) {
      return NextResponse.json({ error: "Client slug is required" }, { status: 400 })
    }

    // Fetch user to get their client
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        clientId: true,
        role: true,
      },
    })

    if (!userRecord) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const client = await prisma.client.findUnique({
      where: { slug: clientSlug },
      select: { id: true, name: true },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    // Only allow users to export their own client's seeds (unless they're super-admin)
    if (userRecord.role !== "super_admin" && userRecord.clientId !== client.id) {
      return NextResponse.json({ error: "Unauthorized to export this client's seeds" }, { status: 403 })
    }

    const seedEmails = await prisma.seedEmail.findMany({
      where: {
        assignedToClient: client.name,
        active: true,
      },
      orderBy: { email: "asc" },
      select: {
        email: true,
      },
    })

    console.log(`[v0] Exporting ${seedEmails.length} seed emails for client: ${client.name}`)

    // Format as comma-separated list for easy copy/paste into email
    const emailList = seedEmails.map((row) => row.email).join(", ")

    // Return as plain text file
    return new NextResponse(emailList, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename="seed-emails-${clientSlug}-${new Date().toISOString().split("T")[0]}.txt"`,
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
