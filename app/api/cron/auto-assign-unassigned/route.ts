import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { findEntityForSender, findEntityForPhone } from "@/lib/ci-entity-utils"

/**
 * Auto-assign unassigned campaigns using AI and donation identifier matching
 * Runs periodically to process campaigns left unassigned from detection
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Auto-Assign Cron: Starting...")

    const stats = {
      emailCampaigns: {
        processed: 0,
        assigned: 0,
        skipped: 0,
        failed: 0,
      },
      smsMessages: {
        processed: 0,
        assigned: 0,
        skipped: 0,
        failed: 0,
      },
    }

    // Process Email Campaigns (limit to 100 per run)
    let unassignedEmails = []
    try {
      console.log("[v0] Auto-Assign Cron: Fetching unassigned email campaigns...")
      unassignedEmails = await prisma.competitiveInsightCampaign.findMany({
        where: {
          entityId: null,
          // Don't re-process manually reviewed campaigns
          OR: [
            { assignmentMethod: null },
            { assignmentMethod: { not: "reviewed" } },
          ],
        },
        take: 100,
        orderBy: {
          dateReceived: "desc",
        },
      })
      console.log(`[v0] Auto-Assign Cron: Found ${unassignedEmails.length} unassigned email campaigns`)
    } catch (error: any) {
      console.error("[v0] Auto-Assign Cron: Error fetching email campaigns:", error.message)
      stats.emailCampaigns.failed++
    }

    // Process each unassigned email campaign
    for (const campaign of unassignedEmails) {
      stats.emailCampaigns.processed++

      try {
        // Skip if no email content (can't do AI analysis)
        if (!campaign.emailContent && !campaign.emailPreview) {
          stats.emailCampaigns.skipped++
          continue
        }

        // Parse ctaLinks
        let ctaLinks: any[] = []
        if (Array.isArray(campaign.ctaLinks)) {
          ctaLinks = campaign.ctaLinks
        } else if (typeof campaign.ctaLinks === "string") {
          ctaLinks = JSON.parse(campaign.ctaLinks)
        } else if (campaign.ctaLinks && typeof campaign.ctaLinks === "object") {
          ctaLinks = campaign.ctaLinks as any[]
        }

        // Use the existing AI + donation identifier matching logic
        const entityResult = await findEntityForSender(
          campaign.senderEmail || "",
          campaign.senderName || "",
          ctaLinks,
          campaign.subject || "",                              // arg 4: emailSubject
          campaign.emailContent || campaign.emailPreview || "" // arg 5: emailBody
        )

        if (entityResult && entityResult.entityId) {
          // Found a match! Assign it
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: {
              entityId: entityResult.entityId,
              assignmentMethod: entityResult.method,
              assignedAt: new Date(),
            },
          })

          stats.emailCampaigns.assigned++
          console.log(
            `[v0] Auto-Assign Cron: Email Campaign ID ${campaign.id} - ASSIGNED to Entity ${entityResult.entityId} via ${entityResult.method}`
          )
        } else {
          stats.emailCampaigns.skipped++
        }
      } catch (error: any) {
        console.error(`[v0] Auto-Assign Cron: Email Campaign ID ${campaign.id} - FAILED:`, error.message)
        stats.emailCampaigns.failed++
      }
    }

    // Process SMS Messages (limit to 100 per run)
    let unassignedSms = []
    try {
      console.log("[v0] Auto-Assign Cron: Fetching unassigned SMS messages...")
      unassignedSms = await prisma.smsQueue.findMany({
        where: {
          entityId: null,
          OR: [
            { assignmentMethod: null },
            { assignmentMethod: { not: "reviewed" } },
          ],
        },
        take: 100,
        orderBy: {
          createdAt: "desc",
        },
      })
      console.log(`[v0] Auto-Assign Cron: Found ${unassignedSms.length} unassigned SMS messages`)
    } catch (error: any) {
      console.error("[v0] Auto-Assign Cron: Error fetching SMS messages:", error.message)
      stats.smsMessages.failed++
    }

    // Process each unassigned SMS
    for (const sms of unassignedSms) {
      stats.smsMessages.processed++

      try {
        // Parse ctaLinks
        let ctaLinks: any[] = []
        if (Array.isArray(sms.ctaLinks)) {
          ctaLinks = sms.ctaLinks
        } else if (typeof sms.ctaLinks === "string") {
          ctaLinks = JSON.parse(sms.ctaLinks)
        } else if (sms.ctaLinks && typeof sms.ctaLinks === "object") {
          ctaLinks = sms.ctaLinks as any[]
        }

        // Use findEntityForPhone for SMS (checks donation identifiers + phone number mappings)
        const entityResult = await findEntityForPhone(
          sms.phoneNumber || "", // Correct field name for sender phone
          ctaLinks
        )

        if (entityResult && entityResult.entityId) {
          // Found a match! Assign it
          await prisma.smsQueue.update({
            where: { id: sms.id },
            data: {
              entityId: entityResult.entityId,
              assignmentMethod: entityResult.assignmentMethod || "auto_phone",
              assignedAt: new Date(),
            },
          })

          stats.smsMessages.assigned++
          console.log(
            `[v0] Auto-Assign Cron: SMS ID ${sms.id} - ASSIGNED to Entity ${entityResult.entityId} via ${entityResult.assignmentMethod || "auto_phone"}`
          )
        } else {
          stats.smsMessages.skipped++
        }
      } catch (error: any) {
        console.error(`[v0] Auto-Assign Cron: SMS ID ${sms.id} - FAILED:`, error.message)
        stats.smsMessages.failed++
      }
    }

    console.log("[v0] Auto-Assign Cron: Completed - Stats:", JSON.stringify(stats, null, 2))

    return NextResponse.json({
      success: true,
      stats,
    })
  } catch (error: any) {
    console.error("[v0] Auto-Assign Cron: Fatal error:", error.message)
    return NextResponse.json(
      {
        error: "Failed to auto-assign campaigns",
        message: error.message,
      },
      { status: 500 }
    )
  }
}
