import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.isValid || !authResult.payload) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get("query") || ""
    const clientSlug = searchParams.get("clientSlug") || ""

    if (query.length < 3) {
      return NextResponse.json({ suggestions: [] })
    }

    const lowerQuery = query.toLowerCase()
    const searchPattern = `%${lowerQuery}%`

    // Search across emails
    const emailSuggestions = await sql`
      SELECT DISTINCT 
        COALESCE("senderName", '') as value,
        'sender' as type
      FROM "CompetitiveInsightCampaign"
      WHERE LOWER("senderName") LIKE ${searchPattern}
      LIMIT 5

      UNION

      SELECT DISTINCT 
        COALESCE("senderEmail", '') as value,
        'email' as type
      FROM "CompetitiveInsightCampaign"
      WHERE LOWER("senderEmail") LIKE ${searchPattern}
      LIMIT 5

      UNION

      SELECT DISTINCT 
        COALESCE("subject", '') as value,
        'subject' as type
      FROM "CompetitiveInsightCampaign"
      WHERE LOWER("subject") LIKE ${searchPattern}
      LIMIT 5
    `

    // Search across SMS
    const smsSuggestions = await sql`
      SELECT DISTINCT 
        COALESCE("phoneNumber", '') as value,
        'phone' as type
      FROM "SmsQueue"
      WHERE LOWER("phoneNumber") LIKE ${searchPattern}
      LIMIT 3

      UNION

      SELECT DISTINCT 
        SUBSTRING(COALESCE("message", ''), 1, 100) as value,
        'sms' as type
      FROM "SmsQueue"
      WHERE LOWER("message") LIKE ${searchPattern}
      LIMIT 5
    `

    // Combine and deduplicate
    const allSuggestions = [...emailSuggestions, ...smsSuggestions]
    const uniqueSuggestions = Array.from(new Map(allSuggestions.map((item) => [item.value, item])).values())

    // Sort: exact matches first, then starts-with, then contains
    const sortedSuggestions = uniqueSuggestions
      .filter((s) => s.value && s.value.trim() !== "")
      .sort((a, b) => {
        const aLower = a.value.toLowerCase()
        const bLower = b.value.toLowerCase()

        if (aLower === lowerQuery) return -1
        if (bLower === lowerQuery) return 1

        if (aLower.startsWith(lowerQuery) && !bLower.startsWith(lowerQuery)) return -1
        if (bLower.startsWith(lowerQuery) && !aLower.startsWith(lowerQuery)) return 1

        return a.value.localeCompare(b.value)
      })
      .slice(0, 8)
      .map((s) => s.value)

    return NextResponse.json({ suggestions: sortedSuggestions })
  } catch (error) {
    console.error("Error fetching suggestions:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
