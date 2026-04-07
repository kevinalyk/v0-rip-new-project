import { NextResponse } from "next/server"
import prisma, { ensureDatabaseConnection } from "@/lib/prisma"
import { checkEmailCompliance } from "@/lib/email-compliance-checker"

export const runtime = "nodejs"
export const maxDuration = 300

// Process campaigns in batches to avoid memory pressure
const BATCH_SIZE = 50

export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await ensureDatabaseConnection()

    const stats = {
      processed: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
    }

    // Only process campaigns that have rawHeaders AND either no compliance record
    // or a stale one (re-check every 1 day in case checker logic is updated)
    const sevenDaysAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)

    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        rawHeaders: { not: null },
        isDeleted: false,
        OR: [
          { compliance: null },
          { compliance: { checkedAt: { lt: sevenDaysAgo } } },
        ],
      },
      select: {
        id: true,
        senderEmail: true,
        senderName: true,
        subject: true,
        rawHeaders: true,
        emailContent: true,
        compliance: { select: { id: true } },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: "desc" },
    })

    if (campaigns.length === 0) {
      return NextResponse.json({
        message: "No campaigns to check",
        stats,
      })
    }

    for (const campaign of campaigns) {
      try {
        if (!campaign.rawHeaders) {
          stats.skipped++
          continue
        }

        const result = checkEmailCompliance({
          senderEmail: campaign.senderEmail,
          senderName: campaign.senderName ?? "",
          subject: campaign.subject,
          rawHeaders: campaign.rawHeaders,
          emailContent: campaign.emailContent,
        })

        const data = {
          hasSpf: result.hasSpf,
          hasDkim: result.hasDkim,
          hasTls: result.hasTls,
          hasValidMessageId: result.hasValidMessageId,
          notImpersonatingGmail: result.notImpersonatingGmail,
          hasArcHeaders: result.hasArcHeaders,
          hasBothSpfAndDkim: result.hasBothSpfAndDkim,
          hasDmarc: result.hasDmarc,
          hasDmarcAlignment: result.hasDmarcAlignment,
          hasOneClickUnsubscribeHeaders: result.hasOneClickUnsubscribeHeaders,
          hasUnsubscribeLinkInBody: result.hasUnsubscribeLinkInBody,
          hasSingleFromAddress: result.hasSingleFromAddress,
          noFakeReplyPrefix: result.noFakeReplyPrefix,
          hasValidFromTo: result.hasValidFromTo,
          noDeceptiveEmojisInSubject: result.noDeceptiveEmojisInSubject,
          noHiddenContent: result.noHiddenContent,
          displayNameClean: result.displayNameClean,
          displayNameNoRecipient: result.displayNameNoRecipient,
          displayNameNoReplyPattern: result.displayNameNoReplyPattern,
          displayNameNoDeceptiveEmojis: result.displayNameNoDeceptiveEmojis,
          displayNameNotGmail: result.displayNameNotGmail,
          section1Score: result.section1Score,
          section2Score: result.section2Score,
          section3Score: result.section3Score,
          section4Score: result.section4Score,
          totalScore: result.totalScore,
          checkedAt: new Date(),
        }

        if (campaign.compliance) {
          // Update existing record
          await prisma.cIEmailCompliance.update({
            where: { campaignId: campaign.id },
            data,
          })
          stats.updated++
        } else {
          // Create new record
          await prisma.cIEmailCompliance.create({
            data: {
              campaignId: campaign.id,
              ...data,
            },
          })
          stats.created++
        }

        stats.processed++
      } catch (err) {
        console.error(`[compliance-cron] Error processing campaign ${campaign.id}:`, err)
        stats.errors++
      }
    }

    return NextResponse.json({
      message: "Email compliance check complete",
      stats,
    })
  } catch (err) {
    console.error("[compliance-cron] Fatal error:", err)
    return NextResponse.json(
      { error: "Internal server error", details: String(err) },
      { status: 500 }
    )
  }
}
