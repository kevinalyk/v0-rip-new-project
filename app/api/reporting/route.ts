import { type NextRequest, NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"
import { verifyAuth } from "@/lib/auth"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    console.log("[v0] Reporting API: Starting request")
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    console.log("[v0] Reporting API: Auth successful, user:", authResult.user.email)

    const { searchParams } = new URL(request.url)
    const period = searchParams.get("period") || "30" // days
    const clientSlug = searchParams.get("clientSlug")
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")

    console.log("[v0] Reporting API: Params - period:", period, "clientSlug:", clientSlug)

    // Determine which client to filter by
    let targetClientId: string | null = null

    if (authResult.user.role === "super_admin") {
      // Super admin can view specific client or all
      if (clientSlug) {
        console.log("[v0] Reporting API: Looking up client by slug:", clientSlug)
        const clientResult = await sql`
          SELECT id FROM "Client" WHERE slug = ${clientSlug}
        `
        if (clientResult.length > 0) {
          targetClientId = clientResult[0].id
          console.log("[v0] Reporting API: Found client ID:", targetClientId)
        } else {
          console.log("[v0] Reporting API: No client found for slug:", clientSlug)
        }
      }
      // If no clientSlug, targetClientId stays null (view all)
    } else {
      // Regular users only see their client's data
      targetClientId = authResult.user.clientId
      console.log("[v0] Reporting API: Regular user, using clientId:", targetClientId)
    }

    let startDate: Date
    let endDate: Date = new Date()

    if (startDateParam && endDateParam) {
      // Custom date range
      startDate = new Date(startDateParam)
      endDate = new Date(endDateParam)
    } else {
      // Preset period
      const daysAgo = period === "all" ? 36500 : Number.parseInt(period) // 100 years for "all"
      startDate = new Date()
      startDate.setDate(startDate.getDate() - daysAgo)
    }

    console.log("[v0] Reporting API: Date range:", startDate.toISOString(), "to", endDate.toISOString())

    console.log("[v0] Reporting API: Fetching campaigns...")
    const campaigns = targetClientId
      ? await sql`
          SELECT 
            id,
            subject,
            sender,
            "deliveryRate",
            "sentDate",
            "assignedToClientId"
          FROM "Campaign"
          WHERE "assignedToClientId" = ${targetClientId}
            AND "sentDate" >= ${startDate.toISOString()}
            AND "sentDate" <= ${endDate.toISOString()}
          ORDER BY "sentDate" DESC
          LIMIT 500
        `
      : await sql`
          SELECT 
            id,
            subject,
            sender,
            "deliveryRate",
            "sentDate",
            "assignedToClientId"
          FROM "Campaign"
          WHERE "sentDate" >= ${startDate.toISOString()}
            AND "sentDate" <= ${endDate.toISOString()}
          ORDER BY "sentDate" DESC
          LIMIT 500
        `

    console.log("[v0] Reporting API: Found", campaigns.length, "campaigns")

    if (campaigns.length === 0) {
      console.log("[v0] Reporting API: No campaigns found, returning empty metrics")
      return NextResponse.json({
        totalCampaigns: 0,
        averageDeliveryRate: 0,
        averageInboxRate: 0,
        totalEmails: 0,
        totalInboxed: 0,
        providerBreakdown: {},
        trendData: [],
        recentCampaigns: [],
      })
    }

    const campaignIds = campaigns.map((c: any) => c.id)
    console.log("[v0] Reporting API: Fetching results for", campaignIds.length, "campaigns...")
    console.log("[v0] Reporting API: First few campaign IDs:", campaignIds.slice(0, 5))

    const results = await sql`
      SELECT 
        "campaignId",
        inboxed,
        delivered,
        "emailProvider",
        "placementStatus"
      FROM "Result"
      WHERE "campaignId" = ANY(${campaignIds})
        AND inboxed IS NOT NULL
      LIMIT 50000
    `

    console.log("[v0] Reporting API: Found", results.length, "results")

    const resultsByCampaign = new Map<string, any[]>()
    results.forEach((result: any) => {
      if (!resultsByCampaign.has(result.campaignId)) {
        resultsByCampaign.set(result.campaignId, [])
      }
      resultsByCampaign.get(result.campaignId)!.push(result)
    })

    // Calculate metrics
    const metrics = {
      totalCampaigns: campaigns.length,
      averageDeliveryRate: 0,
      averageInboxRate: 0,
      totalEmails: 0,
      totalInboxed: 0,
      providerBreakdown: {} as Record<string, { total: number; inbox: number; spam: number }>,
      trendData: [] as Array<{ date: string; deliveryRate: number; inboxRate: number }>,
      recentCampaigns: [] as Array<{
        id: string
        subject: string
        sender: string
        sentDate: string
        deliveryRate: number
        inboxRate: number
      }>,
    }

    console.log("[v0] Reporting API: Calculating metrics...")

    let totalDeliveryRate = 0
    let totalInboxRate = 0

    campaigns.forEach((campaign: any) => {
      const campaignResults = resultsByCampaign.get(campaign.id) || []

      if (campaignResults.length > 0) {
        const total = campaignResults.length
        const inboxed = campaignResults.filter((r: any) => r.inboxed).length
        const spam = campaignResults.filter((r: any) => r.placementStatus === "spam").length
        const delivered = inboxed + spam // Delivered = inbox + spam

        const deliveryRate = total > 0 ? (delivered / total) * 100 : 0
        const inboxRate = delivered > 0 ? (inboxed / delivered) * 100 : 0

        totalDeliveryRate += deliveryRate
        totalInboxRate += inboxRate
        metrics.totalEmails += campaignResults.length
        metrics.totalInboxed += inboxed

        // Provider breakdown
        campaignResults.forEach((r: any) => {
          const provider = r.emailProvider || "unknown"
          if (!metrics.providerBreakdown[provider]) {
            metrics.providerBreakdown[provider] = { total: 0, inbox: 0, spam: 0 }
          }
          metrics.providerBreakdown[provider].total++
          if (r.inboxed) {
            metrics.providerBreakdown[provider].inbox++
          } else if (r.placementStatus === "spam") {
            metrics.providerBreakdown[provider].spam++
          }
        })

        // Recent campaigns
        if (metrics.recentCampaigns.length < 10) {
          metrics.recentCampaigns.push({
            id: campaign.id,
            subject: campaign.subject,
            sender: campaign.sender,
            sentDate: campaign.sentDate,
            deliveryRate,
            inboxRate,
          })
        }
      }
    })

    metrics.averageDeliveryRate = totalDeliveryRate / campaigns.length
    metrics.averageInboxRate = totalInboxRate / campaigns.length

    // Generate trend data (group by week)
    const weeklyData = new Map<string, { deliveryRates: number[]; inboxRates: number[] }>()

    campaigns.forEach((campaign: any) => {
      const date = new Date(campaign.sentDate)
      const weekStart = new Date(date)
      weekStart.setDate(date.getDate() - date.getDay()) // Start of week
      const weekKey = weekStart.toISOString().split("T")[0]

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, { deliveryRates: [], inboxRates: [] })
      }

      const campaignResults = resultsByCampaign.get(campaign.id) || []

      if (campaignResults.length > 0) {
        const total = campaignResults.length
        const inboxed = campaignResults.filter((r: any) => r.inboxed).length
        const spam = campaignResults.filter((r: any) => r.placementStatus === "spam").length
        const delivered = inboxed + spam

        const deliveryRate = total > 0 ? (delivered / total) * 100 : 0
        const inboxRate = delivered > 0 ? (inboxed / delivered) * 100 : 0

        weeklyData.get(weekKey)!.deliveryRates.push(deliveryRate)
        weeklyData.get(weekKey)!.inboxRates.push(inboxRate)
      }
    })

    // Convert to array and calculate averages
    metrics.trendData = Array.from(weeklyData.entries())
      .map(([date, data]) => ({
        date,
        deliveryRate: data.deliveryRates.reduce((a, b) => a + b, 0) / data.deliveryRates.length,
        inboxRate: data.inboxRates.reduce((a, b) => a + b, 0) / data.inboxRates.length,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    console.log("[v0] Reporting API: Metrics calculated successfully")
    return NextResponse.json(metrics)
  } catch (error) {
    console.error("[v0] Reporting API: Error fetching reporting data:", error)
    return NextResponse.json({ error: "Failed to fetch reporting data" }, { status: 500 })
  }
}
