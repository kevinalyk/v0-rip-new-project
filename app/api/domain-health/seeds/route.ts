import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser(request)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = user.userId || user.id
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clientId: true },
    })
    if (!userRecord) return NextResponse.json({ error: "User not found" }, { status: 404 })

    // Resolve the client name to scope the query
    let clientName: string | null = null

    if (userRecord.role === "super_admin") {
      // Super admins may pass a clientSlug to scope, or see all domain health seeds
      const { searchParams } = new URL(request.url)
      const clientSlug = searchParams.get("clientSlug")
      if (clientSlug) {
        const client = await prisma.client.findUnique({
          where: { slug: clientSlug },
          select: { name: true },
        })
        clientName = client?.name ?? null
      }
    } else {
      if (!userRecord.clientId) return NextResponse.json({ error: "No client assigned" }, { status: 403 })
      const client = await prisma.client.findUnique({
        where: { id: userRecord.clientId },
        select: { name: true },
      })
      clientName = client?.name ?? null
    }

    // Domain health seeds: assigned to this client, locked, AND domainHealthMode ON
    const where = clientName
      ? { assignedToClient: clientName, locked: true, domainHealthMode: true }
      : { locked: true, domainHealthMode: true }

    const seeds = await prisma.seedEmail.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        provider: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ seeds, total: seeds.length })
  } catch (err) {
    console.error("[domain-health/seeds] error:", err)
    return NextResponse.json({ error: "Failed to fetch seeds" }, { status: 500 })
  }
}
