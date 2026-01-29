import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { checkAllSeedEmails } from "@/lib/email-checker"

export const runtime = "nodejs"
export const maxDuration = 300

async function verifyDatabaseConnection(retries = 3): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`
      console.log("Database connection verified")
      return true
    } catch (error) {
      console.error(`Database connection attempt ${i + 1} failed:`, error)
      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }
  return false
}

// This endpoint will be called by a cron job to automatically check all active campaigns
export async function GET(request: Request) {
  try {
    const startTime = Date.now()
    const TIMEOUT_BUFFER = 30000 // 30 seconds
    const MAX_EXECUTION_TIME = 270000 // 4.5 minutes (270 seconds)

    console.log("Starting automated campaign email checking")

    const dbConnected = await verifyDatabaseConnection()
    if (!dbConnected) {
      console.error("Database connection failed after retries")
      return NextResponse.json(
        { error: "Database connection failed", details: "Could not establish connection after multiple attempts" },
        { status: 503 }
      )
    }

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    console.log(`Checking for campaigns sent after: ${twoDaysAgo.toISOString()}`)

    // Check total campaigns in database
    const totalCampaigns = await prisma.campaign.count()
    console.log(`Total campaigns in database: ${totalCampaigns}`)

    const recentCampaigns = await prisma.campaign.findMany({
      where: {
        sentDate: {
          gte: twoDaysAgo,
        },
        assignedToClientId: {
          not: null,
        },
      },
      include: {
        domain: true,
      },
      orderBy: { sentDate: "desc" },
      take: 6, // Limit to 6 campaigns per run
    })

    console.log(`Found ${recentCampaigns.length} recent campaigns to check`)

    if (recentCampaigns.length === 0) {
      const mostRecentCampaign = await prisma.campaign.findFirst({
        orderBy: { sentDate: "desc" },
        select: {
          subject: true,
          sentDate: true
        }
      })
      if (mostRecentCampaign && mostRecentCampaign.sentDate) {
        console.log(`Latest campaign in DB: ${mostRecentCampaign.subject} sent on ${mostRecentCampaign.sentDate}`)
      } else {
        console.log("No campaigns with sentDate found in database")
      }
    }

    if (recentCampaigns.length > 0) {
      console.log(`Most recent campaign: ${recentCampaigns[0].subject} sent on ${recentCampaigns[0].sentDate}`)
    }

    const results = []
    let campaignsChecked = 0
    let campaignsSkipped = 0

    for (const campaign of recentCampaigns) {
      const elapsedTime = Date.now() - startTime
      if (elapsedTime > MAX_EXECUTION_TIME) {
        console.log(
          `Approaching timeout limit. Stopping after ${campaignsChecked} campaigns. ${recentCampaigns.length - campaignsChecked} campaigns skipped.`,
        )
        campaignsSkipped = recentCampaigns.length - campaignsChecked
        break
      }

      try {
        console.log(`Checking campaign: ${campaign.subject} (Domain: ${campaign.domain?.name || "Unknown"})`)
        const checkResult = await checkAllSeedEmails(campaign)
        results.push({
          campaignId: campaign.id,
          subject: campaign.subject,
          domainName: campaign.domain?.name,
          ...checkResult,
        })
        campaignsChecked++

        await new Promise((resolve) => setTimeout(resolve, 3000))
      } catch (error) {
        console.error(`Error checking campaign ${campaign.id}:`, error)
        results.push({
          campaignId: campaign.id,
          subject: campaign.subject,
          domainName: campaign.domain?.name,
          error: error instanceof Error ? error.message : String(error),
        })
        campaignsChecked++
      }
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000)
    console.log(
      `Campaign checking complete. Checked: ${campaignsChecked}, Skipped: ${campaignsSkipped}, Total time: ${totalTime}s`,
    )

    return NextResponse.json({
      success: true,
      campaignsChecked,
      campaignsSkipped,
      totalExecutionTime: totalTime,
      results,
    })
  } catch (error) {
    console.error("Error in automated campaign checking:", error)
    return NextResponse.json(
      { error: "Failed to check campaigns", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
