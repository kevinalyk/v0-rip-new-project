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

// DELETE ?id=<searchId>  — deletes one record
// DELETE (no params)     — clears all records for the current user
export async function DELETE(request: NextRequest) {
  try {
    const session = await getLookupSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (id) {
      // Delete a single search — must belong to this user
      await sql`
        DELETE FROM "LookupSearch"
        WHERE id = ${id} AND "userId" = ${session.userId}
      `
    } else {
      // Clear all searches for this user
      await sql`
        DELETE FROM "LookupSearch"
        WHERE "userId" = ${session.userId}
      `
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[lookup/history DELETE]", error)
    return NextResponse.json(
      { error: "Failed to delete history." },
      { status: 500 }
    )
  }
}
