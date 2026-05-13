import { type NextRequest, NextResponse } from "next/server"
import { getLookupSessionFromRequest } from "@/lib/lookup-auth"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

function normalizePhone(raw: string): string {
  // Strip everything except digits and leading +
  const stripped = raw.replace(/[^\d+]/g, "")
  // If it doesn't start with + assume US number
  if (!stripped.startsWith("+")) {
    const digits = stripped.replace(/\D/g, "")
    return digits.length === 10 ? `+1${digits}` : `+${digits}`
  }
  return stripped
}

function extractDomain(email: string): string {
  const parts = email.split("@")
  return parts.length === 2 ? parts[1].toLowerCase().trim() : ""
}

function detectQueryType(q: string): "phone" | "email" {
  return q.includes("@") ? "email" : "phone"
}

export async function POST(request: NextRequest) {
  try {
    const session = await getLookupSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Please log in to search." }, { status: 401 })
    }

    const { query } = await request.json()
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      return NextResponse.json(
        { error: "Please enter a valid phone number or email address." },
        { status: 400 }
      )
    }

    const q = query.trim()
    const queryType = detectQueryType(q)

    let matchedEntityIds: string[] = []

    if (queryType === "phone") {
      const normalized = normalizePhone(q)
      const rows = await sql`
        SELECT DISTINCT "entityId"
        FROM "CiEntityMapping"
        WHERE "senderPhone" = ${normalized}
      `
      matchedEntityIds = rows.map((r: any) => r.entityId)
    } else {
      // email: match on exact senderEmail OR senderDomain
      const domain = extractDomain(q)
      const rows = await sql`
        SELECT DISTINCT "entityId"
        FROM "CiEntityMapping"
        WHERE "senderEmail" = ${q.toLowerCase()}
           OR "senderDomain" = ${domain}
      `
      matchedEntityIds = rows.map((r: any) => r.entityId)
    }

    let entities: any[] = []
    if (matchedEntityIds.length > 0) {
      entities = await sql`
        SELECT
          id,
          name,
          type,
          description,
          party,
          state,
          "imageUrl",
          office,
          "ballotpediaUrl"
        FROM "CiEntity"
        WHERE id = ANY(${matchedEntityIds})
        ORDER BY name ASC
      `
    }

    // Persist the search
    const searchId = crypto.randomUUID()
    const now = new Date().toISOString()
    await sql`
      INSERT INTO "LookupSearch" (id, "userId", query, "queryType", results, "createdAt")
      VALUES (
        ${searchId},
        ${session.userId},
        ${q},
        ${queryType},
        ${JSON.stringify(entities)},
        ${now}
      )
    `

    return NextResponse.json({ results: entities, queryType, query: q })
  } catch (error) {
    console.error("[lookup/search]", error)
    return NextResponse.json(
      { error: "Search failed. Please try again." },
      { status: 500 }
    )
  }
}
