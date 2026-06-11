import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/auth"
import { classifyMessageTypes } from "@/lib/message-classifier"

// Process 25 campaigns per request to stay within serverless function time limits.
// The admin card calls this repeatedly (pagination via cursor) until hasMore = false.
const BATCH_SIZE = 25

export async function POST(request: Request) {
  const authResult = await requireSuperAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const body = await request.json().catch(() => ({}))
    // cursor is the last processed campaign id — null means start from newest
    const cursor: string | null = body.cursor ?? null
    const forceReclassify: boolean = body.forceReclassify === true

    // Fetch next batch of campaigns — newest first
    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        isDeleted: false,
        ...(forceReclassify ? {} : { messageTypes: { isEmpty: true } }),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      select: {
        id: true,
        rawSubject: true,
        subject: true,
        emailPreview: true,
      },
      orderBy: { id: "desc" }, // newest first
      take: BATCH_SIZE,
    })

    if (campaigns.length === 0) {
      return NextResponse.json({ processed: 0, hasMore: false, cursor: null, samples: [] })
    }

    const samples: Array<{ id: string; subject: string; types: string[] }> = []
    let classified = 0
    let skipped = 0

    for (const campaign of campaigns) {
      const subject = campaign.rawSubject || campaign.subject
      const preview = campaign.emailPreview || ""

      if (!subject) {
        skipped++
        continue
      }

      try {
        const types = await classifyMessageTypes(subject, preview)

        // Always write the result (even empty array) so the row is no longer
        // considered "unclassified pending" and won't be retried on every backfill run.
        // Rows that genuinely couldn't be classified stay at [] and can be force-reclassified later.
        await prisma.competitiveInsightCampaign.update({
          where: { id: campaign.id },
          data: { messageTypes: types },
        })

        if (types.length > 0) {
          classified++
          if (samples.length < 10) {
            samples.push({ id: campaign.id, subject: campaign.subject, types })
          }
        } else {
          skipped++
        }
      } catch (err) {
        console.error(`[backfill-message-types] failed for campaign ${campaign.id}:`, err)
        skipped++
      }
    }

    const nextCursor = campaigns[campaigns.length - 1].id

    // Check if there are more campaigns remaining
    const remaining = await prisma.competitiveInsightCampaign.count({
      where: {
        isDeleted: false,
        ...(forceReclassify ? {} : { messageTypes: { isEmpty: true } }),
        id: { lt: nextCursor },
      },
    })

    return NextResponse.json({
      processed: campaigns.length,
      classified,
      skipped,
      hasMore: remaining > 0,
      remaining,
      cursor: nextCursor,
      samples,
    })
  } catch (error) {
    console.error("[backfill-message-types] error:", error)
    return NextResponse.json({ error: "Backfill failed" }, { status: 500 })
  }
}

export async function GET(request: Request) {
  const authResult = await requireSuperAdmin(request)
  if (authResult instanceof NextResponse) return authResult

  // Return count of unclassified campaigns
  const pending = await prisma.competitiveInsightCampaign.count({
    where: { isDeleted: false, messageTypes: { isEmpty: true } },
  })
  const total = await prisma.competitiveInsightCampaign.count({
    where: { isDeleted: false },
  })

  return NextResponse.json({ pending, total, classified: total - pending })
}
