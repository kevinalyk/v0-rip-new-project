import { type NextRequest, NextResponse } from "next/server"
import { getLookupSessionFromRequest } from "@/lib/lookup-auth"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

/**
 * Returns an array of candidate values to match against senderPhone.
 * We try multiple forms because the DB may store short codes (5-6 digits),
 * full E.164 (+1XXXXXXXXXX), or raw 10-digit strings.
 */
function phoneVariants(raw: string): string[] {
  const digitsOnly = raw.replace(/\D/g, "")
  const candidates = new Set<string>()

  // Always try exactly what the user typed (trimmed) and digits-only
  candidates.add(raw.trim())
  candidates.add(digitsOnly)

  const len = digitsOnly.length
  if (len === 5 || len === 6) {
    // Short code — no country prefix, store as-is
    // already added above
  } else if (len === 10) {
    // US 10-digit — add E.164 variant
    candidates.add(`+1${digitsOnly}`)
  } else if (len === 11 && digitsOnly.startsWith("1")) {
    // US 11-digit with country code
    candidates.add(`+${digitsOnly}`)
    candidates.add(digitsOnly.slice(1)) // without country code
    candidates.add(`+1${digitsOnly.slice(1)}`)
  } else if (len > 6) {
    // International — try with leading +
    candidates.add(`+${digitsOnly}`)
  }

  return Array.from(candidates)
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
      const variants = phoneVariants(q)
      const rows = await sql`
        SELECT DISTINCT "entityId"
        FROM "CiEntityMapping"
        WHERE "senderPhone" = ANY(${variants})
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
