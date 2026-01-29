import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const blockedDomains = await prisma.blockedDomain.findMany({
      orderBy: { createdAt: "desc" },
    })

    return NextResponse.json(blockedDomains)
  } catch (error) {
    console.error("Error fetching blocked domains:", error)
    return NextResponse.json({ error: "Failed to fetch blocked domains" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { domain, reason } = await request.json()

    if (!domain) {
      return NextResponse.json({ error: "Domain is required" }, { status: 400 })
    }

    // Normalize domain (lowercase, remove protocol, www, etc.)
    const normalizedDomain = domain
      .toLowerCase()
      .replace(/^(https?:\/\/)?(www\.)?/, "")
      .split("/")[0]

    // Check if already blocked
    const existing = await prisma.blockedDomain.findUnique({
      where: { domain: normalizedDomain },
    })

    if (existing) {
      return NextResponse.json({ error: "Domain is already blocked" }, { status: 400 })
    }

    // Find all domains matching this domain string
    const domainsToDelete = await prisma.domain.findMany({
      where: {
        domain: {
          contains: normalizedDomain,
          mode: "insensitive",
        },
      },
      select: { id: true },
    })

    const domainIds = domainsToDelete.map((d) => d.id)

    // Find all campaigns linked to these domains
    const campaignsToDelete = await prisma.campaign.findMany({
      where: {
        domainId: {
          in: domainIds,
        },
      },
      select: { id: true },
    })

    const campaignIds = campaignsToDelete.map((c) => c.id)

    // Delete in order: Results -> EmailContent -> Campaigns -> Domains
    // Then create the blocked domain entry
    let resultsDeleted, emailContentDeleted
    await prisma.$transaction(async (tx) => {
      // Delete results
      resultsDeleted = await tx.result.deleteMany({
        where: { campaignId: { in: campaignIds } },
      })

      // Delete email content
      emailContentDeleted = await tx.emailContent.deleteMany({
        where: { campaignId: { in: campaignIds } },
      })

      // Delete campaigns
      const campaignsDeleted = await tx.campaign.deleteMany({
        where: { id: { in: campaignIds } },
      })

      // Delete domains
      const domainsDeleted = await tx.domain.deleteMany({
        where: { id: { in: domainIds } },
      })

      // Create blocked domain entry
      await tx.blockedDomain.create({
        data: {
          domain: normalizedDomain,
          reason: reason || null,
          createdBy: authResult.user.userId || authResult.user.id,
        },
      })

      console.log(
        `[v0] Blocked domain ${normalizedDomain}: Deleted ${domainsDeleted.count} domains, ${campaignsDeleted.count} campaigns, ${resultsDeleted.count} results, ${emailContentDeleted.count} email contents`,
      )
    })

    return NextResponse.json({
      success: true,
      deleted: {
        domains: domainIds.length,
        campaigns: campaignIds.length,
        results: resultsDeleted.count,
        emailContent: emailContentDeleted.count,
      },
    })
  } catch (error) {
    console.error("Error blocking domain:", error)
    return NextResponse.json({ error: "Failed to block domain" }, { status: 500 })
  }
}
