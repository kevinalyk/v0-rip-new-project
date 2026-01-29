import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { verifyAuth } from "@/lib/auth"
import { nanoid } from "nanoid"

const prisma = new PrismaClient()

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const campaignId = params.id

    let campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        shareToken: true,
        shareTokenCreatedAt: true,
        shareCount: true,
      },
    })

    let isSms = false

    if (!campaign) {
      // Try finding as SMS message
      const smsMessage = await prisma.smsQueue.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          shareToken: true,
          shareTokenCreatedAt: true,
          shareCount: true,
        },
      })

      if (!smsMessage) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
      }

      campaign = smsMessage as any
      isSms = true
    }

    // Check if existing token is still valid (within 7 days)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const tokenExpired = campaign.shareTokenCreatedAt && campaign.shareTokenCreatedAt < sevenDaysAgo

    // Generate new token if none exists or if expired
    if (!campaign.shareToken || tokenExpired) {
      const newToken = nanoid(16)

      if (isSms) {
        campaign = (await prisma.smsQueue.update({
          where: { id: campaignId },
          data: {
            shareToken: newToken,
            shareTokenCreatedAt: now,
            shareCount: tokenExpired ? 1 : (campaign.shareCount || 0) + 1,
          },
          select: {
            id: true,
            shareToken: true,
            shareTokenCreatedAt: true,
            shareCount: true,
          },
        })) as any
      } else {
        campaign = await prisma.competitiveInsightCampaign.update({
          where: { id: campaignId },
          data: {
            shareToken: newToken,
            shareTokenCreatedAt: now,
            shareCount: tokenExpired ? 1 : (campaign.shareCount || 0) + 1,
          },
          select: {
            id: true,
            shareToken: true,
            shareTokenCreatedAt: true,
            shareCount: true,
          },
        })
      }
    } else {
      // Increment share count
      if (isSms) {
        campaign = (await prisma.smsQueue.update({
          where: { id: campaignId },
          data: {
            shareCount: (campaign.shareCount || 0) + 1,
          },
          select: {
            id: true,
            shareToken: true,
            shareTokenCreatedAt: true,
            shareCount: true,
          },
        })) as any
      } else {
        campaign = await prisma.competitiveInsightCampaign.update({
          where: { id: campaignId },
          data: {
            shareCount: (campaign.shareCount || 0) + 1,
          },
          select: {
            id: true,
            shareToken: true,
            shareTokenCreatedAt: true,
            shareCount: true,
          },
        })
      }
    }

    // Generate share URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.headers.get("origin") || "http://localhost:3000"
    const shareUrl = `${baseUrl}/share/${campaign.shareToken}`

    return NextResponse.json({
      shareUrl,
      shareToken: campaign.shareToken,
      expiresAt: new Date(campaign.shareTokenCreatedAt!.getTime() + 7 * 24 * 60 * 60 * 1000),
    })
  } catch (error) {
    console.error("Error generating share link:", error)
    return NextResponse.json({ error: "Failed to generate share link" }, { status: 500 })
  }
}
