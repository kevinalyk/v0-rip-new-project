import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

export const runtime = "nodejs"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Starting cleanup of old results...")

    // Join through domains to get all active domains for each client
    const clients = await sql`
      SELECT 
        c.id as "clientId",
        c.name as "clientName",
        c."dataRetentionDays" as "retentionPeriod",
        array_agg(d.id) as "domainIds"
      FROM "Client" c
      LEFT JOIN "Domain" d ON c.id = d."assignedToClientId" AND d.active = true
      WHERE c.active = true
      GROUP BY c.id, c.name, c."dataRetentionDays"
    `

    let totalDeleted = 0
    const deletionSummary: Array<{ client: string; deleted: number; retentionDays: number }> = []

    for (const client of clients) {
      const retentionDays = client.retentionPeriod || 90 // Default to 90 days if not set
      const domainIds = client.domainIds || []

      // Skip if client has no domains
      if (domainIds.length === 0 || domainIds[0] === null) {
        console.log(`Skipping client ${client.clientName} - no domains assigned`)
        continue
      }

      // Calculate cutoff date
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      console.log(`Processing client ${client.clientName} with ${retentionDays} day retention...`)

      const deleteResult = await sql`
        DELETE FROM "Result" 
        WHERE "campaignId" IN (
          SELECT id FROM "Campaign" WHERE "domainId" = ANY(${domainIds})
        )
        AND "createdAt" < ${cutoffDate.toISOString()}
      `

      const deletedCount = deleteResult.count || 0
      totalDeleted += deletedCount

      deletionSummary.push({
        client: client.clientName,
        deleted: deletedCount,
        retentionDays: retentionDays,
      })

      console.log(`Deleted ${deletedCount} old results for client ${client.clientName}`)
    }

    console.log(`Cleanup completed. Total deleted: ${totalDeleted}`)

    return NextResponse.json({
      success: true,
      totalDeleted,
      clientsProcessed: clients.length,
      deletionSummary,
      message: `Successfully cleaned up ${totalDeleted} old results across ${clients.length} clients`,
    })
  } catch (error) {
    console.error("Error during cleanup:", error)
    return NextResponse.json(
      {
        error: "Failed to cleanup old results",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
