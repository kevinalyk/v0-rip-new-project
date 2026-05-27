import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    const auth = await verifyAuth(request)
    if (!auth?.success || !auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clientSlug = searchParams.get("clientSlug")
    if (!clientSlug) return NextResponse.json({ error: "Missing clientSlug" }, { status: 400 })

    // Resolve client
    const isSuperAdmin = auth.user.role === "super_admin"
    let targetClientId: string

    if (isSuperAdmin && clientSlug === "admin") {
      // Super admin gets a synthetic client; use first client for context or just skip plan check
      targetClientId = "admin"
    } else {
      const client = await prisma.client.findUnique({
        where: { slug: clientSlug },
        select: { id: true, subscriptionPlan: true },
      })
      if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })

      // Access gate: only Professional ("all") and enterprise plans allowed
      if (!isSuperAdmin && client.subscriptionPlan !== "all" && client.subscriptionPlan !== "enterprise") {
        return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
      }
      targetClientId = client.id
    }

    // Parse filters
    const party = searchParams.get("party") || null       // "republican" | "democrat" | "independent"
    const source = searchParams.get("source") || null      // "house" | "third_party"
    const entityId = searchParams.get("entityId") || null
    const fromDate = searchParams.get("fromDate") || null
    const toDate = searchParams.get("toDate") || null
    const limit = Math.min(Number(searchParams.get("limit") || "50"), 100)

    // Build shared WHERE clauses
    const partyClause = party ? `AND e.party = ${party === "republican" ? "'republican'" : party === "democrat" ? "'democrat'" : "'independent'"}` : ""
    const entityClause = entityId ? `AND c."entityId" = '${entityId.replace(/'/g, "''")}'` : ""
    const fromClause = fromDate ? `AND DATE(c."dateReceived") >= '${fromDate}'` : ""
    const toClause = toDate ? `AND DATE(c."dateReceived") <= '${toDate}'` : ""
    const smsFromClause = fromDate ? `AND DATE(s."createdAt") >= '${fromDate}'` : ""
    const smsToClause = toDate ? `AND DATE(s."createdAt") <= '${toDate}'` : ""
    const smsEntityClause = entityId ? `AND s."entityId" = '${entityId.replace(/'/g, "''")}'` : ""

    // Source filter: house file vs third party
    // House file = source = 'seed' and no third-party indicator
    // We use the source column on CompetitiveInsightCampaign / SmsQueue
    const sourceEmailClause = source === "house" ? `AND c.source = 'seed'` : source === "third_party" ? `AND c.source = 'personal'` : ""
    const sourceSmsClause = source === "house" ? `AND s.source = 'seed'` : source === "third_party" ? `AND s.source = 'personal'` : ""

    // 1. Email Subject Frequency
    // Group by subject, count distinct dates
    const subjectRows = await prisma.$queryRawUnsafe<Array<{
      subject: string
      send_days: bigint
      entity_name: string | null
      entity_party: string | null
      entity_id: string | null
      last_sent: Date | null
      example_id: string
    }>>(`
      SELECT
        c.subject,
        COUNT(DISTINCT DATE_TRUNC('hour', c."dateReceived")) AS send_days,
        e.name AS entity_name,
        e.party AS entity_party,
        e.id AS entity_id,
        MAX(c."dateReceived") AS last_sent,
        MIN(c.id) AS example_id
      FROM "CompetitiveInsightCampaign" c
      LEFT JOIN "CiEntity" e ON e.id = c."entityId"
      WHERE c."isHidden" = false
        AND c."isDeleted" = false
        ${partyClause}
        ${entityClause}
        ${fromClause}
        ${toClause}
        ${sourceEmailClause}
      GROUP BY c.subject, e.name, e.party, e.id
      HAVING COUNT(DISTINCT DATE_TRUNC('hour', c."dateReceived")) > 1
      ORDER BY send_days DESC, last_sent DESC
      LIMIT ${limit}
    `)

    // 2. Email Body Frequency
    // Group by bodyFingerprint, pick the most-recent campaign as representative
    const emailBodyRows = await prisma.$queryRawUnsafe<Array<{
      body_fingerprint: string
      send_days: bigint
      entity_name: string | null
      entity_party: string | null
      entity_id: string | null
      last_sent: Date | null
      example_id: string
      example_subject: string
      example_preview: string | null
    }>>(`
      SELECT
        c."bodyFingerprint" AS body_fingerprint,
        COUNT(DISTINCT DATE_TRUNC('hour', c."dateReceived")) AS send_days,
        e.name AS entity_name,
        e.party AS entity_party,
        e.id AS entity_id,
        MAX(c."dateReceived") AS last_sent,
        (SELECT id FROM "CompetitiveInsightCampaign" c2 WHERE c2."bodyFingerprint" = c."bodyFingerprint" AND c2."isHidden" = false AND c2."isDeleted" = false ORDER BY c2."dateReceived" DESC LIMIT 1) AS example_id,
        (SELECT subject FROM "CompetitiveInsightCampaign" c2 WHERE c2."bodyFingerprint" = c."bodyFingerprint" AND c2."isHidden" = false AND c2."isDeleted" = false ORDER BY c2."dateReceived" DESC LIMIT 1) AS example_subject,
        (SELECT "emailPreview" FROM "CompetitiveInsightCampaign" c2 WHERE c2."bodyFingerprint" = c."bodyFingerprint" AND c2."isHidden" = false AND c2."isDeleted" = false ORDER BY c2."dateReceived" DESC LIMIT 1) AS example_preview
      FROM "CompetitiveInsightCampaign" c
      LEFT JOIN "CiEntity" e ON e.id = c."entityId"
      WHERE c."bodyFingerprint" IS NOT NULL
        AND c."isHidden" = false
        AND c."isDeleted" = false
        ${partyClause}
        ${entityClause}
        ${fromClause}
        ${toClause}
        ${sourceEmailClause}
      GROUP BY c."bodyFingerprint", e.name, e.party, e.id
      HAVING COUNT(DISTINCT DATE_TRUNC('hour', c."dateReceived")) > 1
      ORDER BY send_days DESC, last_sent DESC
      LIMIT ${limit}
    `)

    // 3. SMS Body Frequency
    const smsBodyRows = await prisma.$queryRawUnsafe<Array<{
      body_fingerprint: string
      send_days: bigint
      entity_name: string | null
      entity_party: string | null
      entity_id: string | null
      last_sent: Date | null
      example_id: string
      example_message: string | null
    }>>(`
      SELECT
        s."bodyFingerprint" AS body_fingerprint,
        COUNT(DISTINCT DATE_TRUNC('hour', s."createdAt")) AS send_days,
        e.name AS entity_name,
        e.party AS entity_party,
        e.id AS entity_id,
        MAX(s."createdAt") AS last_sent,
        (SELECT id FROM "SmsQueue" s2 WHERE s2."bodyFingerprint" = s."bodyFingerprint" AND s2."isHidden" = false AND s2."isDeleted" = false ORDER BY s2."createdAt" DESC LIMIT 1) AS example_id,
        (SELECT message FROM "SmsQueue" s2 WHERE s2."bodyFingerprint" = s."bodyFingerprint" AND s2."isHidden" = false AND s2."isDeleted" = false ORDER BY s2."createdAt" DESC LIMIT 1) AS example_message
      FROM "SmsQueue" s
      LEFT JOIN "CiEntity" e ON e.id = s."entityId"
      WHERE s."bodyFingerprint" IS NOT NULL
        AND s."isHidden" = false
        AND s."isDeleted" = false
        ${party ? `AND e.party = '${party}'` : ""}
        ${smsEntityClause}
        ${smsFromClause}
        ${smsToClause}
        ${sourceSmsClause}
      GROUP BY s."bodyFingerprint", e.name, e.party, e.id
      HAVING COUNT(DISTINCT DATE_TRUNC('hour', s."createdAt")) > 1
      ORDER BY send_days DESC, last_sent DESC
      LIMIT ${limit}
    `)

    // Serialize bigints
    const serializeRows = (rows: any[]) =>
      rows.map((r) => ({
        ...r,
        send_days: Number(r.send_days),
      }))

    return NextResponse.json({
      emailSubjects: serializeRows(subjectRows),
      emailBodies: serializeRows(emailBodyRows),
      smsBodies: serializeRows(smsBodyRows),
    })
  } catch (err) {
    console.error("[content-frequency]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
