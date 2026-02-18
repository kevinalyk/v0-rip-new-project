import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, hasAccessToDomain } from "@/lib/auth"
import { canClientPerformWrites } from "@/lib/seed-utils"

export async function POST(request: Request) {
  try {
    console.log("POST /api/campaigns/create called")

    // Check authentication
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { subject, sender, fromEmail, domainId } = await request.json()
    console.log("Creating campaign:", { subject, sender, fromEmail, domainId })

    if (!subject || !sender || !fromEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const userRecord = await prisma.user.findUnique({
      where: { id: user.id },
      select: { clientId: true },
    })

    let assignedToClientId: string | null = null

    if (userRecord?.clientId && userRecord.clientId !== "RIP") {
      const canWrite = await canClientPerformWrites(userRecord.clientId)
      if (!canWrite) {
        return NextResponse.json(
          { error: "Your subscription is not active. Please reactivate to create campaigns." },
          { status: 403 },
        )
      }

      // User belongs to a client, look up the client ID
      const client = await prisma.client.findUnique({
        where: { slug: userRecord.clientId },
        select: { id: true },
      })
      assignedToClientId = client?.id || null
      console.log(`Assigning campaign to client: ${assignedToClientId}`)
    }

    let finalDomainId = domainId

    // If no domainId provided, try to auto-assign based on fromEmail
    if (!finalDomainId) {
      const emailDomain = fromEmail.split("@")[1]?.toLowerCase()
      if (emailDomain) {
        const existingDomain = await prisma.domain.findFirst({
          where: {
            domain: {
              contains: emailDomain,
              mode: "insensitive",
            },
            assignedToClientId: assignedToClientId, // Must match the client
          },
        })

        if (existingDomain) {
          finalDomainId = existingDomain.id
          console.log(`Auto-assigned to existing domain: ${existingDomain.name}`)
        } else {
          // For now, assign to first available domain the user has access to
          const userDomains = await prisma.userDomainAccess.findMany({
            where: { userId: user.id },
            include: { domain: true },
          })

          if (userDomains.length > 0) {
            finalDomainId = userDomains[0].domainId
            console.log(`Auto-assigned to user's first domain: ${userDomains[0].domain.name}`)
          } else {
            return NextResponse.json({ error: "No accessible domains found" }, { status: 400 })
          }
        }
      }
    }

    // Check if user has access to the domain
    const hasAccess = await hasAccessToDomain(user.id, finalDomainId)
    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied to this domain" }, { status: 403 })
    }

    const campaign = await prisma.campaign.create({
      data: {
        subject: subject.trim(),
        sender: sender.trim(),
        fromEmail: fromEmail.trim(),
        deliveryRate: 0,
        sentDate: new Date(),
        domainId: finalDomainId,
        assignedToClientId: assignedToClientId, // Assign to client
      },
      include: {
        domain: true,
      },
    })

    console.log("Campaign created successfully:", campaign)
    return NextResponse.json(campaign)
  } catch (error) {
    console.error("Error creating campaign:", error)
    return NextResponse.json(
      {
        error: "Failed to create campaign",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
