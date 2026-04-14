import { NextResponse } from "next/server"
import { neon } from "@neondatabase/serverless"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes — hard deletes can take time on large tables

const sql = neon(process.env.DATABASE_URL!)

const THREE_MONTHS_AGO = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 3)
  return d.toISOString()
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const cutoff = THREE_MONTHS_AGO()
    const results: Record<string, number> = {}

    // -------------------------------------------------------------------------
    // 1. UNASSIGNED emails — entityId IS NULL and no clientId (true orphans)
    //    Use createdAt since they were never acted on
    // -------------------------------------------------------------------------
    const unassignedEmails = await sql`
      DELETE FROM "CompetitiveInsightCampaign"
      WHERE "entityId" IS NULL
        AND "clientId" IS NULL
        AND "createdAt" < ${cutoff}
      RETURNING id
    `
    results.unassignedEmails = unassignedEmails.length

    const unassignedSms = await sql`
      DELETE FROM "SmsQueue"
      WHERE "entityId" IS NULL
        AND "clientId" IS NULL
        AND "createdAt" < ${cutoff}
      RETURNING id
    `
    results.unassignedSms = unassignedSms.length

    // -------------------------------------------------------------------------
    // 2. SOFT-DELETED emails & SMS — isDeleted = true
    //    Use deletedAt if set, otherwise createdAt as fallback
    // -------------------------------------------------------------------------
    const deletedEmails = await sql`
      DELETE FROM "CompetitiveInsightCampaign"
      WHERE "isDeleted" = true
        AND COALESCE("deletedAt", "createdAt") < ${cutoff}
      RETURNING id
    `
    results.deletedEmails = deletedEmails.length

    const deletedSms = await sql`
      DELETE FROM "SmsQueue"
      WHERE "isDeleted" = true
        AND COALESCE("deletedAt", "createdAt") < ${cutoff}
      RETURNING id
    `
    results.deletedSms = deletedSms.length

    // -------------------------------------------------------------------------
    // 3. HIDDEN emails & SMS — isHidden = true
    //    Use hiddenAt if set, otherwise createdAt as fallback
    // -------------------------------------------------------------------------
    const hiddenEmails = await sql`
      DELETE FROM "CompetitiveInsightCampaign"
      WHERE "isHidden" = true
        AND COALESCE("hiddenAt", "createdAt") < ${cutoff}
      RETURNING id
    `
    results.hiddenEmails = hiddenEmails.length

    const hiddenSms = await sql`
      DELETE FROM "SmsQueue"
      WHERE "isHidden" = true
        AND COALESCE("hiddenAt", "createdAt") < ${cutoff}
      RETURNING id
    `
    results.hiddenSms = hiddenSms.length

    const totalDeleted = Object.values(results).reduce((a, b) => a + b, 0)

    console.log("purge-old-ci-data completed:", results)

    return NextResponse.json({
      success: true,
      cutoffDate: cutoff,
      totalDeleted,
      breakdown: results,
      message: `Purged ${totalDeleted} records older than 3 months.`,
    })
  } catch (error) {
    console.error("purge-old-ci-data error:", error)
    return NextResponse.json(
      {
        error: "Failed to purge old CI data",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
