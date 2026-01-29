import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, getUserDomains } from "@/lib/auth"

// Get all campaigns (filtered by user's domain access)
export async function GET(request: Request) {
  try {
    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get query parameters
    const url = new URL(request.url)
    const fromDate = url.searchParams.get("from")
    const toDate = url.searchParams.get("to")
    const minRate = url.searchParams.get("minRate")
    const maxRate = url.searchParams.get("maxRate")
    const domainId = url.searchParams.get("domainId") // Optional domain filter
    const clientSlug = url.searchParams.get("clientSlug")

    // Build where clause
    const where: any = {}

    const userId = user.userId || user.id
    const userRecord = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clientId: true, email: true },
    })

    const isSuperAdmin = userRecord?.role === "super_admin"
    console.log(`[v0] User ${userRecord?.email} (${userId}) - Role: ${userRecord?.role}, Super Admin: ${isSuperAdmin}`)
    console.log(`[v0] Query parameters - clientSlug: ${clientSlug}, domainId: ${domainId}`)

    if (clientSlug) {
      console.log(`[v0] Looking up client with slug: ${clientSlug}`)
      const client = await prisma.client.findUnique({
        where: { slug: clientSlug },
        select: { id: true },
      })

      if (client) {
        console.log(`[v0] Found client with ID: ${client.id}`)
        // Find all domains assigned to this client
        const clientDomains = await prisma.domain.findMany({
          where: { assignedToClientId: client.id },
          select: { id: true, name: true },
        })

        const clientDomainIds = clientDomains.map((d) => d.id)
        console.log(`[v0] Client ${clientSlug} has ${clientDomains.length} domains:`, clientDomainIds)

        if (clientDomainIds.length === 0) {
          console.log("[v0] Client has no domains, returning empty array")
          return NextResponse.json([])
        }

        // Filter campaigns by client's domains
        where.domainId = { in: clientDomainIds }
        console.log(`[v0] Filtering campaigns by client's domain IDs: [${clientDomainIds.join(", ")}]`)
      } else {
        console.log(`[v0] Client not found for slug: ${clientSlug}`)
        return NextResponse.json({ error: "Client not found" }, { status: 404 })
      }
    } else if (!isSuperAdmin) {
      console.log(`[v0] No clientSlug provided, checking user's client assignment`)

      if (userRecord?.clientId) {
        // User has a client - show campaigns from domains assigned to their client
        console.log(`[v0] User belongs to client: ${userRecord.clientId}`)
        const clientDomains = await prisma.domain.findMany({
          where: { assignedToClientId: userRecord.clientId },
          select: { id: true, name: true },
        })

        const clientDomainIds = clientDomains.map((d) => d.id)
        console.log(`[v0] User's client has ${clientDomains.length} domains:`, clientDomainIds)

        if (clientDomainIds.length === 0) {
          console.log("[v0] User's client has no domains, returning empty array")
          return NextResponse.json([])
        }

        where.domainId = { in: clientDomainIds }
        console.log(`[v0] Filtering campaigns by user's client domain IDs: [${clientDomainIds.join(", ")}]`)
      } else {
        // Fallback to UserDomainAccess
        console.log(`[v0] User has no client, checking UserDomainAccess`)
        const userDomains = await getUserDomains(userId)
        const domainIds = userDomains.map((d) => d.id)

        console.log(`[v0] User has access to ${userDomains.length} domains via UserDomainAccess:`)
        userDomains.forEach((d) => {
          console.log(`[v0]   - Domain ID: ${d.id}, Name: ${d.name}, Domain: ${d.domain}`)
        })

        if (domainIds.length === 0) {
          console.log("[v0] User has no domain access, returning empty array")
          return NextResponse.json([])
        }

        where.domainId = { in: domainIds }
        console.log(`[v0] Filtering campaigns by accessible domain IDs: [${domainIds.join(", ")}]`)
      }
    }

    // If specific domain requested, filter to that domain (if user has access)
    if (domainId && domainId !== "all") {
      if (!isSuperAdmin && !clientSlug) {
        let hasAccess = false

        if (userRecord?.clientId) {
          const clientDomain = await prisma.domain.findFirst({
            where: {
              id: domainId,
              assignedToClientId: userRecord.clientId,
            },
          })
          hasAccess = !!clientDomain
        } else {
          const userDomains = await getUserDomains(userId)
          hasAccess = userDomains.some((d) => d.id === domainId)
        }

        if (!hasAccess) {
          console.log(`[v0] User does not have access to domain ${domainId}`)
          return NextResponse.json({ error: "Access denied to this domain" }, { status: 403 })
        }
      }
      where.domainId = domainId
      console.log(`[v0] Filtering to specific domain: ${domainId}`)
    }

    // Date filtering
    if (fromDate) {
      where.sentDate = {
        ...where.sentDate,
        gte: new Date(fromDate),
      }
    }

    if (toDate) {
      where.sentDate = {
        ...where.sentDate,
        lte: new Date(toDate),
      }
    }

    // Delivery rate filtering
    if (minRate) {
      where.deliveryRate = {
        ...where.deliveryRate,
        gte: Number.parseFloat(minRate) / 100,
      }
    }

    if (maxRate) {
      where.deliveryRate = {
        ...where.deliveryRate,
        lte: Number.parseFloat(maxRate) / 100,
      }
    }

    console.log("[v0] Final campaign query where clause:", JSON.stringify(where, null, 2))

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { sentDate: "desc" },
      include: {
        results: true,
        domain: true, // Include domain info
      },
    })

    console.log(`[v0] Found ${campaigns.length} campaigns matching the query`)
    if (campaigns.length > 0) {
      console.log(`[v0] First campaign: "${campaigns[0].subject}" from domain ${campaigns[0].domain?.name}`)
    }

    return NextResponse.json(campaigns)
  } catch (error) {
    console.error("Error fetching campaigns:", error)
    return NextResponse.json({ error: "Failed to fetch campaigns" }, { status: 500 })
  }
}
