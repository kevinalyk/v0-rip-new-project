import type { Metadata } from "next"
import { PrismaClient } from "@prisma/client"
import SharePageClient from "./share-page-client"

const prisma = new PrismaClient()

async function incrementViewCount(token: string) {
  try {
    // Try email campaign first
    const campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { shareToken: token },
      select: { id: true },
    })

    if (campaign) {
      await prisma.competitiveInsightCampaign.update({
        where: { id: campaign.id },
        data: {
          viewCount: { increment: 1 },
          shareViewCount: { increment: 1 },
        },
      })
      return
    }

    // Try SMS
    const sms = await prisma.smsQueue.findUnique({
      where: { shareToken: token },
      select: { id: true },
    })

    if (sms) {
      await prisma.smsQueue.update({
        where: { id: sms.id },
        data: {
          viewCount: { increment: 1 },
          shareViewCount: { increment: 1 },
        },
      })
    }
  } catch (error) {
    console.error("[share] Failed to increment view count for token", token, error)
  }
}

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
        title: "Shared Campaign — Inbox.GOP",
        description: "View this shared campaign on Inbox.GOP",
      }
    }

    const entityName = campaign.entity?.name || (isSms ? campaign.phoneNumber : campaign.senderName)
    const title = `${entityName} — Inbox.GOP`
    const description = isSms
      ? (campaign as any).message?.slice(0, 160)
      : campaign.subject?.slice(0, 160) || "View this campaign on Inbox.GOP"

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: "website",
        images: [
          {
            url: `/api/og/share/${token}`,
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
        images: [`/api/og/share/${token}`],
      },
    }
  } catch (error) {
    console.error("[OG] Error generating share metadata:", error)
    return {
      title: "Shared Campaign — Inbox.GOP",
      description: "View this shared campaign on Inbox.GOP",
    }
  }
}

export default async function SharePage({ params }: { params: { token: string } }) {
  // Increment view count server-side on every page load — no auth required
  await incrementViewCount(params.token)
  return <SharePageClient />
}
