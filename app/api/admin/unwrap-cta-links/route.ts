import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

async function resolveRedirects(url: string): Promise<string> {
  const maxRedirects = 10
  let currentUrl = url
  let redirectCount = 0

  try {
    while (redirectCount < maxRedirects) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      try {
        const response = await fetch(currentUrl, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location")
          if (!location) {
            return currentUrl
          }

          const nextUrl = new URL(location, currentUrl).toString()
          currentUrl = nextUrl
          redirectCount++
        } else if (response.status === 200) {
          return currentUrl
        } else {
          return currentUrl
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === "AbortError") {
          return currentUrl
        }
        throw fetchError
      }
    }

    return currentUrl
  } catch (error: any) {
    console.error("[Admin] Error resolving redirects:", error.message)
    return currentUrl
  }
}

function stripQueryParams(url: string): string {
  try {
    const urlObj = new URL(url)
    return `${urlObj.origin}${urlObj.pathname}`
  } catch {
    const questionMarkIndex = url.indexOf("?")
    return questionMarkIndex !== -1 ? url.substring(0, questionMarkIndex) : url
  }
}

export async function POST(request: Request) {
  try {
    const sql = neon(process.env.DATABASE_URL!)

    const campaigns = await sql`
      SELECT id, "ctaLinks"
      FROM "CompetitiveInsightCampaign"
      WHERE "ctaLinks" IS NOT NULL
      AND "ctaLinks" != 'null'
      AND "ctaLinks" != '[]'
      AND (
        "ctaLinks"::text NOT LIKE '%"finalUrl"%'
        OR "ctaLinks"::text LIKE '%"finalUrl":""%'
      )
    `

    let processed = 0
    let updated = 0
    let skipped = 0
    let errors = 0

    for (const campaign of campaigns) {
      try {
        const ctaLinks = typeof campaign.ctaLinks === "string" ? JSON.parse(campaign.ctaLinks) : campaign.ctaLinks

        if (!Array.isArray(ctaLinks) || ctaLinks.length === 0) {
          skipped++
          continue
        }

        let needsUpdate = false
        const updatedLinks = []

        for (const link of ctaLinks) {
          if (link.finalUrl && link.finalUrl !== link.url) {
            updatedLinks.push(link)
            continue
          }

          const resolvedUrl = await resolveRedirects(link.url)

          const cleanedUrl = stripQueryParams(link.url)
          const cleanedFinalUrl = stripQueryParams(resolvedUrl)

          if (cleanedFinalUrl !== cleanedUrl) {
            updatedLinks.push({
              ...link,
              url: cleanedUrl,
              finalUrl: cleanedFinalUrl,
              displayUrl: cleanedFinalUrl,
            })
            needsUpdate = true
          } else {
            updatedLinks.push({
              ...link,
              url: cleanedUrl,
              finalUrl: cleanedUrl,
              displayUrl: cleanedUrl,
            })
          }
        }

        if (needsUpdate) {
          await sql`
            UPDATE "CompetitiveInsightCampaign"
            SET "ctaLinks" = ${JSON.stringify(updatedLinks)}
            WHERE id = ${campaign.id}
          `
          updated++
        } else {
          skipped++
        }

        processed++
      } catch (error: any) {
        console.error(`[Admin] Error processing campaign ${campaign.id}:`, error.message)
        errors++
      }
    }

    const summary = {
      processed,
      updated,
      skipped,
      errors,
      totalCampaigns: campaigns.length,
    }

    console.log("[Admin] CTA unwrap complete:", summary)

    return NextResponse.json({
      success: true,
      message: `Processed ${processed}/${campaigns.length} campaigns. Updated: ${updated}, Skipped: ${skipped}, Errors: ${errors}`,
      summary,
    })
  } catch (error: any) {
    console.error("[Admin] Error in unwrap CTA links:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
