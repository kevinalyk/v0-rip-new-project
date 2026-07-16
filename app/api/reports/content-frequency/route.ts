import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { getCached, setCached, buildCacheKey } from "@/lib/content-frequency-cache"

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

    // Check cache — same filter combination returns instantly for 5 minutes
    const cacheKey = buildCacheKey({ clientSlug, party, source, entityId, fromDate, toDate, limit: String(limit) })
    const cached = getCached(cacheKey)
    if (cached) {
      return NextResponse.json(cached, {
        headers: { "X-Cache": "HIT" },
      })
    }

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

    // Run all 3 queries in parallel — previously sequential, adding ~3x the latency
    const [subjectRows, emailBodyRows, smsBodyRows] = await Promise.all([

      // 1. Email Subject Frequency
      // Uses DISTINCT ON to pick the most-recent example row (for shareToken + donation link)
      prisma.$queryRawUnsafe<Array<{
        subject: string
        send_days: bigint
        entity_name: string | null
        entity_party: string | null
        entity_id: string | null
        last_sent: Date | null
        example_id: string
        example_share_token: string | null
        donation_url: string | null
      }>>(`
        WITH agg AS (
          SELECT
            c.subject,
            COUNT(DISTINCT DATE_TRUNC('hour', c."dateReceived")) AS send_days,
            e.name AS entity_name,
            e.party AS entity_party,
            e.id AS entity_id,
            MAX(c."dateReceived") AS last_sent
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
        ),
        examples AS (
          -- Most recent send per subject: grab shareToken + first WinRed/ActBlue link from that send
          SELECT DISTINCT ON (c.subject)
            c.subject,
            c.id AS example_id,
            c."shareToken" AS example_share_token,
            (
              SELECT NULLIF(link->>'finalUrl', '')
              FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(c."ctaLinks") = 'array' THEN c."ctaLinks" ELSE '[]'::jsonb END
              ) AS link
              WHERE NULLIF(link->>'finalUrl', '') ILIKE '%winred.com%'
                 OR NULLIF(link->>'finalUrl', '') ILIKE '%actblue.com%'
              LIMIT 1
            ) AS donation_url
          FROM "CompetitiveInsightCampaign" c
          WHERE c."isHidden" = false
            AND c."isDeleted" = false
            AND c.subject IS NOT NULL
            AND c.subject IN (SELECT subject FROM agg WHERE subject IS NOT NULL)
          ORDER BY c.subject, c."dateReceived" DESC
        )
        SELECT
          agg.subject,
          agg.send_days,
          agg.entity_name,
          agg.entity_party,
          agg.entity_id,
          agg.last_sent,
          ex.example_id,
          ex.example_share_token,
          ex.donation_url
        FROM agg
        JOIN examples ex ON ex.subject = agg.subject
        ORDER BY agg.send_days DESC, agg.last_sent DESC
        LIMIT ${limit}
      `),

      // 2. Email Body Frequency — use DISTINCT ON to avoid 3 correlated subqueries per row
      prisma.$queryRawUnsafe<Array<{
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
        WITH agg AS (
          SELECT
            c."bodyFingerprint",
            COUNT(DISTINCT DATE_TRUNC('hour', c."dateReceived")) AS send_days,
            e.name AS entity_name,
            e.party AS entity_party,
            e.id AS entity_id,
            MAX(c."dateReceived") AS last_sent
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
        ),
        examples AS (
          SELECT DISTINCT ON (c."bodyFingerprint")
            c."bodyFingerprint",
            c.id AS example_id,
            c.subject AS example_subject,
            c."emailPreview" AS example_preview
          FROM "CompetitiveInsightCampaign" c
          WHERE c."bodyFingerprint" IS NOT NULL
            AND c."isHidden" = false
            AND c."isDeleted" = false
            AND c."bodyFingerprint" IN (SELECT "bodyFingerprint" FROM agg)
          ORDER BY c."bodyFingerprint", c."dateReceived" DESC
        )
        SELECT
          agg."bodyFingerprint" AS body_fingerprint,
          agg.send_days,
          agg.entity_name,
          agg.entity_party,
          agg.entity_id,
          agg.last_sent,
          ex.example_id,
          ex.example_subject,
          ex.example_preview
        FROM agg
        JOIN examples ex ON ex."bodyFingerprint" = agg."bodyFingerprint"
        ORDER BY agg.send_days DESC, agg.last_sent DESC
        LIMIT ${limit}
      `),

      // 3. SMS Body Frequency — same DISTINCT ON pattern
      prisma.$queryRawUnsafe<Array<{
        body_fingerprint: string
        send_days: bigint
        entity_name: string | null
        entity_party: string | null
        entity_id: string | null
        last_sent: Date | null
        example_id: string
        example_message: string | null
      }>>(`
        WITH agg AS (
          SELECT
            s."bodyFingerprint",
            COUNT(DISTINCT DATE_TRUNC('hour', s."createdAt")) AS send_days,
            e.name AS entity_name,
            e.party AS entity_party,
            e.id AS entity_id,
            MAX(s."createdAt") AS last_sent
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
        ),
        examples AS (
          SELECT DISTINCT ON (s."bodyFingerprint")
            s."bodyFingerprint",
            s.id AS example_id,
            s.message AS example_message
          FROM "SmsQueue" s
          WHERE s."bodyFingerprint" IS NOT NULL
            AND s."isHidden" = false
            AND s."isDeleted" = false
            AND s."bodyFingerprint" IN (SELECT "bodyFingerprint" FROM agg)
          ORDER BY s."bodyFingerprint", s."createdAt" DESC
        )
        SELECT
          agg."bodyFingerprint" AS body_fingerprint,
          agg.send_days,
          agg.entity_name,
          agg.entity_party,
          agg.entity_id,
          agg.last_sent,
          ex.example_id,
          ex.example_message
        FROM agg
        JOIN examples ex ON ex."bodyFingerprint" = agg."bodyFingerprint"
        ORDER BY agg.send_days DESC, agg.last_sent DESC
        LIMIT ${limit}
      `),

    ])

    // DEBUG: inspect ctaLinks storage type for the top subject row
    if (subjectRows.length > 0) {
      const topRow = subjectRows[0] as any
      console.log("[v0] Top subject row:", topRow.subject, "| send_days:", topRow.send_days, "| donation_url:", topRow.donation_url)

      // Directly query the example row's ctaLinks to see raw storage format
      const debugRow = await prisma.$queryRawUnsafe<Array<{
        id: string
        ctaLinksType: string
        ctaLinksRaw: string | null
        ctaLinksLength: number | null
      }>>(`
        SELECT
          id,
          pg_typeof("ctaLinks")::text AS "ctaLinksType",
          "ctaLinks"::text AS "ctaLinksRaw",
          CASE
            WHEN jsonb_typeof("ctaLinks"::jsonb) = 'array'
            THEN jsonb_array_length("ctaLinks"::jsonb)
            ELSE 0
          END AS "ctaLinksLength"
        FROM "CompetitiveInsightCampaign"
        WHERE id = '${topRow.example_id}'
        LIMIT 1
      `)
      if (debugRow.length > 0) {
        const dr = debugRow[0] as any
        console.log("[v0] example_id:", dr.id)
        console.log("[v0] ctaLinks pg_typeof:", dr.ctaLinksType)
        console.log("[v0] ctaLinks array length:", dr.ctaLinksLength)
        console.log("[v0] ctaLinks raw (first 600 chars):", String(dr.ctaLinksRaw ?? "null").slice(0, 600))
      }
    }

    // Serialize bigints — all other fields pass through as-is
    const serializeRows = (rows: any[]) =>
      rows.map((r) => ({
        ...r,
        send_days: Number(r.send_days),
      }))

    const result = {
      emailSubjects: serializeRows(subjectRows),
      emailBodies: serializeRows(emailBodyRows),
      smsBodies: serializeRows(smsBodyRows),
    }

    setCached(cacheKey, result)

    return NextResponse.json(result, {
      headers: { "X-Cache": "MISS" },
    })
  } catch (err) {
    console.error("[content-frequency]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
