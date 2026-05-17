import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

function isProfessionalPlan(plan: string | null | undefined): boolean {
  const p = plan?.toLowerCase() ?? ""
  return p === "all" || p === "professional" || p === "pro"
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params

    // Determine if requester is on the Professional ($300) plan
    let hasProfessionalAccess = false
    const token = request.cookies.get("auth_token")?.value
    if (token) {
      try {
        const payload = await verifyToken(token)
        if (payload) {
          const user = await prisma.user.findUnique({
            where: { id: payload.userId as string },
            select: {
              role: true,
              client: { select: { subscriptionPlan: true } },
            },
          })
          if (user) {
            hasProfessionalAccess =
              user.role === "super_admin" ||
              isProfessionalPlan(user.client?.subscriptionPlan)
          }
        }
      } catch {
        // Invalid token — treat as unauthenticated
      }
    }

    // Find the entity by slug
    const entities = await prisma.ciEntity.findMany({
      where: { type: { not: "data_broker" } },
      select: { id: true, name: true },
    })
    const entity = entities.find((e) => nameToSlug(e.name) === slug)

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 })
    }

    // Get the most recent campaign that has a compliance record for this entity
    const latestCampaignWithCompliance = await prisma.competitiveInsightCampaign.findFirst({
      where: {
        entityId: entity.id,
        compliance: { isNot: null },
      },
      orderBy: { dateReceived: "desc" },
      select: {
        id: true,
        dateReceived: true,
        inboxCount: true,
        spamCount: true,
        inboxRate: true,
        compliance: {
          select: {
            hasSpf: true,
            hasDkim: true,
            hasDmarc: true,
            hasDmarcAlignment: true,
            hasTls: true,
            hasOneClickUnsubscribeHeaders: true,
            hasUnsubscribeLinkInBody: true,
            hasBothSpfAndDkim: true,
            hasValidMessageId: true,
            noFakeReplyPrefix: true,
            noDeceptiveEmojisInSubject: true,
            hasSingleFromAddress: true,
            totalScore: true,
            section1Score: true,
            section2Score: true,
            section3Score: true,
            section4Score: true,
            checkedAt: true,
          },
        },
      },
    })

    // No compliance data exists for this entity at all
    if (!latestCampaignWithCompliance?.compliance) {
      return NextResponse.json({ hasData: false, locked: !hasProfessionalAccess })
    }

    const compliance = latestCampaignWithCompliance.compliance
    const totalScore = compliance.totalScore ?? null
    // Convert 0.0–1.0 score to 0–100
    const scoreOutOf100 = totalScore !== null ? Math.round(totalScore * 100) : null

    // Non-professional users get a locked response with only enough info for the teaser
    if (!hasProfessionalAccess) {
      return NextResponse.json({
        hasData: true,
        locked: true,
        scoreOutOf100, // we DO send the score — the frontend blurs/obscures it visually
      })
    }

    return NextResponse.json({
      hasData: true,
      locked: false,
      scoreOutOf100,
      checkedAt: compliance.checkedAt,
      inboxRate: latestCampaignWithCompliance.inboxRate,
      inboxCount: latestCampaignWithCompliance.inboxCount,
      spamCount: latestCampaignWithCompliance.spamCount,
      checks: {
        spf: compliance.hasSpf,
        dkim: compliance.hasDkim,
        dmarc: compliance.hasDmarc,
        dmarcAlignment: compliance.hasDmarcAlignment,
        tls: compliance.hasTls,
        oneClickUnsubscribe: compliance.hasOneClickUnsubscribeHeaders,
        unsubscribeLinkInBody: compliance.hasUnsubscribeLinkInBody,
        bothSpfAndDkim: compliance.hasBothSpfAndDkim,
        validMessageId: compliance.hasValidMessageId,
        noFakeReplyPrefix: compliance.noFakeReplyPrefix,
        noDeceptiveEmojisInSubject: compliance.noDeceptiveEmojisInSubject,
        singleFromAddress: compliance.hasSingleFromAddress,
      },
    })
  } catch (error) {
    console.error("[deliverability] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
