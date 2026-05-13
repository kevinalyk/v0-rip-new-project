import { type NextRequest, NextResponse } from "next/server"
import { getLookupSessionFromRequest } from "@/lib/lookup-auth"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const session = await getLookupSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const rows = await sql`
      SELECT id, query, "queryType", results, "createdAt"
      FROM "LookupSearch"
      WHERE "userId" = ${session.userId}
      ORDER BY "createdAt" DESC
      LIMIT 50
    `

    return NextResponse.json({ history: rows })
  } catch (error) {
    console.error("[lookup/history]", error)
    return NextResponse.json(
      { error: "Failed to fetch history." },
      { status: 500 }
    )
  }
}
