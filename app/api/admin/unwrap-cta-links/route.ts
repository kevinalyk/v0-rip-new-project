import { neon } from "@neondatabase/serverless"
import { NextResponse } from "next/server"

async function resolveRedirects(url: string): Promise<string> {
  const maxRedirects = 10
  let currentUrl = url
  let redirectCount = 0

  console.log(`[v0] Starting redirect resolution for: ${url.substring(0, 100)}...`)

  try {
    while (redirectCount < maxRedirects) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      try {
        const response = await fetch(currentUrl, {
          method: "HEAD", // Use HEAD to avoid downloading full page content
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate, br",
          },
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        console.log(`[v0] Redirect step ${redirectCount + 1}: ${response.status} - ${currentUrl.substring(0, 100)}...`)

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location")
          if (!location) {
            console.log(`[v0] No location header found, stopping at: ${currentUrl.substring(0, 100)}...`)
            return currentUrl
          }

          const nextUrl = new URL(location, currentUrl).toString()
          console.log(`[v0] Following redirect to: ${nextUrl.substring(0, 100)}...`)
          currentUrl = nextUrl
          redirectCount++
        } else if (response.status === 200) {
          console.log(`[v0] Reached final destination: ${currentUrl.substring(0, 100)}...`)
          return currentUrl
        } else {
          console.log(`[v0] Unexpected status ${response.status}, stopping at: ${currentUrl.substring(0, 100)}...`)
          return currentUrl
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === "AbortError") {
          console.log(`[v0] Request timeout, stopping at: ${currentUrl.substring(0, 100)}...`)
          return currentUrl
        }
        throw fetchError
      }
    }

    console.log(`[v0] Max redirects reached, stopping at: ${currentUrl.substring(0, 100)}...`)
    return currentUrl
  } catch (error: any) {
    console.error("[v0] Error resolving redirects:", error.message, "for URL:", url.substring(0, 100))
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
