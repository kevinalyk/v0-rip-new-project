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

    // Support lookup by entityId query param (from reports page) OR by slug (from directory page)
    const entityId = request.nextUrl.searchParams.get("entityId")

    let entity: { id: string; name: string } | null = null

    if (entityId) {
      // Direct ID lookup — fast and accurate
      entity = await prisma.ciEntity.findUnique({
        where: { id: entityId },
        select: { id: true, name: true },
      })
    } else {
      // Slug-based lookup — used from the public directory pages
      const entities = await prisma.ciEntity.findMany({
        where: { type: { not: "data_broker" } },
        select: { id: true, name: true },
      })
      entity = entities.find((e) => nameToSlug(e.name) === slug) ?? null
    }

    if (!entity) {
      return NextResponse.json({ error: "Entity not found" }, { status: 404 })
    }

    // Get ALL campaigns with compliance records for this entity to aggregate all-time data
    const campaignsWithCompliance = await prisma.competitiveInsightCampaign.findMany({
      where: {
        entityId: entity.id,
        compliance: { isNot: null },
      },
      select: {
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
          },
        },
      },
    })

    // No compliance data exists for this entity at all
    if (campaignsWithCompliance.length === 0) {
      return NextResponse.json({ hasData: false, locked: !hasProfessionalAccess })
    }

    const count = campaignsWithCompliance.length

    // Average the totalScore across all records (stored as 0.0–1.0)
    const avgTotalScore =
      campaignsWithCompliance.reduce((sum, c) => sum + (c.compliance?.totalScore ?? 0), 0) / count
    const scoreOutOf100 = Math.round(avgTotalScore * 100)

    // Non-professional users get a locked response with only enough info for the teaser
    if (!hasProfessionalAccess) {
      return NextResponse.json({
        hasData: true,
        locked: true,
        scoreOutOf100,
        sendCount: count,
      })
    }

    // Aggregate inbox/spam counts and rate across all sends
    const totalInboxCount = campaignsWithCompliance.reduce((sum, c) => sum + (c.inboxCount ?? 0), 0)
    const totalSpamCount = campaignsWithCompliance.reduce((sum, c) => sum + (c.spamCount ?? 0), 0)
    const totalSeeds = totalInboxCount + totalSpamCount
    const avgInboxRate = totalSeeds > 0 ? totalInboxCount / totalSeeds : null

    // For each boolean check, use majority-wins across all records
    type CheckKey = "spf" | "dkim" | "dmarc" | "dmarcAlignment" | "tls" | "oneClickUnsubscribe" |
      "unsubscribeLinkInBody" | "bothSpfAndDkim" | "validMessageId" | "noFakeReplyPrefix" |
      "noDeceptiveEmojisInSubject" | "singleFromAddress"

    const checkFields: Record<CheckKey, keyof NonNullable<typeof campaignsWithCompliance[0]["compliance"]>> = {
      spf: "hasSpf",
      dkim: "hasDkim",
      dmarc: "hasDmarc",
      dmarcAlignment: "hasDmarcAlignment",
      tls: "hasTls",
      oneClickUnsubscribe: "hasOneClickUnsubscribeHeaders",
      unsubscribeLinkInBody: "hasUnsubscribeLinkInBody",
      bothSpfAndDkim: "hasBothSpfAndDkim",
      validMessageId: "hasValidMessageId",
      noFakeReplyPrefix: "noFakeReplyPrefix",
      noDeceptiveEmojisInSubject: "noDeceptiveEmojisInSubject",
      singleFromAddress: "hasSingleFromAddress",
    }

    const aggregatedChecks = Object.fromEntries(
      Object.entries(checkFields).map(([key, field]) => {
        const trueCount = campaignsWithCompliance.filter(
          (c) => c.compliance?.[field] === true
        ).length
        return [key, trueCount / count >= 0.5] // majority wins
      })
    )

    return NextResponse.json({
      hasData: true,
      locked: false,
      scoreOutOf100,
      sendCount: count,
      inboxRate: avgInboxRate,
      inboxCount: totalInboxCount,
      spamCount: totalSpamCount,
      checks: aggregatedChecks,
    })
  } catch (error) {
    console.error("[deliverability] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
