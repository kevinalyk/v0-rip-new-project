import type { Metadata } from "next"
import { PrismaClient } from "@prisma/client"
import SharePageClient from "./share-page-client"

const prisma = new PrismaClient()

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  try {
    const token = params.token

    // Try finding email campaign first
    let campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { shareToken: token },
      include: { entity: true },
    })

    let isSms = false
    if (!campaign) {
      // Try finding SMS
      const smsMessage = await prisma.smsQueue.findUnique({
        where: { shareToken: token },
        include: { entity: true },
      })
      if (smsMessage) {
        campaign = smsMessage as any
        isSms = true
      }
    }

    if (!campaign) {
      return {
        title: "Shared Campaign - RIP",
        description: "View this shared campaign on RIP Tool",
      }
    }

    // Check if expired (7 days)
    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    if (campaign.shareTokenCreatedAt && campaign.shareTokenCreatedAt < sevenDaysAgo) {
      return {
        title: "Expired Link - RIP",
        description: "This share link has expired",
      }
    }

    const entityName = campaign.entity?.name || (isSms ? campaign.phoneNumber : campaign.senderName)
    const title = `${entityName} on RIP`
    const description = isSms
      ? (campaign as any).message?.slice(0, 160)
      : campaign.subject?.slice(0, 160) || "View this campaign on RIP Tool"

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: [
          {
            url: `/share/${token}/opengraph-image`,
            width: 1200,
            height: 630,
            alt: `${entityName} on RIP`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title,
        description,
        images: [`/share/${token}/opengraph-image`],
      },
    }
  } catch (error) {
    console.error("[OG] Error generating share metadata:", error)
    return {
      title: "Shared Campaign - RIP",
      description: "View this shared campaign on RIP Tool",
    }
  }
}

export default function SharePage() {
  return <SharePageClient />
}
