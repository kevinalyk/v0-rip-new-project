import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { neon } from "@neondatabase/serverless"
import https from "https"

const sql = neon(process.env.DATABASE_URL!)

// Custom HTTPS agent that ignores SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

// Same unwrapping logic as test-unwrap-url
async function resolveRedirectsWithSteps(url: string): Promise<{
  finalUrl: string
  error?: string
}> {
  const maxRedirects = 10
  let currentUrl = url
  let redirectCount = 0
  const startTime = Date.now()

  try {
    while (redirectCount < maxRedirects) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)

      try {
        const response = await fetch(currentUrl, {
          method: "HEAD",
          redirect: "manual",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
          signal: controller.signal,
          // @ts-ignore - Node.js specific agent to handle SSL issues
          agent: currentUrl.startsWith("https") ? httpsAgent : undefined,
        })

        clearTimeout(timeoutId)

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location")
          if (!location) {
            break
          }
          currentUrl = new URL(location, currentUrl).toString()
          redirectCount++
        } else if (response.status === 200) {
          // Check for meta/JS redirects
          const getResponse = await fetch(currentUrl, {
            method: "GET",
            redirect: "manual",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
            signal: controller.signal,
            // @ts-ignore - Node.js specific agent to handle SSL issues
            agent: currentUrl.startsWith("https") ? httpsAgent : undefined,
          })

          const html = await getResponse.text()

          // Check meta refresh
          const metaPatterns = [
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?/i,
            /<meta[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?[^>]*http-equiv=["']?refresh["']?/i,
          ]

          let metaMatch = null
          for (const pattern of metaPatterns) {
            metaMatch = html.match(pattern)
            if (metaMatch) break
          }

          if (metaMatch && metaMatch[1]) {
            currentUrl = new URL(metaMatch[1], currentUrl).toString()
            redirectCount++
            continue
          }

          // Check JS redirects
          const jsPatterns = [
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
            /location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
          ]

          let jsMatch = null
          for (const pattern of jsPatterns) {
            jsMatch = html.match(pattern)
            if (jsMatch) break
          }

          if (jsMatch && jsMatch[1]) {
            currentUrl = new URL(jsMatch[1], currentUrl).toString()
            redirectCount++
            continue
          }

          // No redirect found - final destination
          return { finalUrl: currentUrl }
        } else if (response.status === 405) {
          // HEAD not allowed - try GET
          const getResponse = await fetch(currentUrl, {
            method: "GET",
            redirect: "manual",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            signal: controller.signal,
            // @ts-ignore - Node.js specific agent to handle SSL issues
            agent: currentUrl.startsWith("https") ? httpsAgent : undefined,
          })

          if (getResponse.status >= 300 && getResponse.status < 400) {
            const location = getResponse.headers.get("location")
            if (location) {
              currentUrl = new URL(location, currentUrl).toString()
              redirectCount++
              continue
            }
          }

          const html = await getResponse.text()

          // Check meta/JS redirects same as above
          const metaPatterns = [
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?/i,
          ]

          let metaMatch = null
          for (const pattern of metaPatterns) {
            metaMatch = html.match(pattern)
            if (metaMatch) break
          }

          if (metaMatch && metaMatch[1]) {
            currentUrl = new URL(metaMatch[1], currentUrl).toString()
            redirectCount++
            continue
          }

          const jsPatterns = [
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
          ]

          let jsMatch = null
          for (const pattern of jsPatterns) {
            jsMatch = html.match(pattern)
            if (jsMatch) break
          }

          if (jsMatch && jsMatch[1]) {
            currentUrl = new URL(jsMatch[1], currentUrl).toString()
            redirectCount++
            continue
          }

          return { finalUrl: currentUrl }
        } else {
          return { finalUrl: currentUrl }
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === "AbortError") {
          return { finalUrl: currentUrl, error: "Request timeout after 30 seconds" }
        }
        return { finalUrl: currentUrl, error: fetchError.message }
      }
    }

    return { finalUrl: currentUrl, error: redirectCount >= maxRedirects ? "Max redirects reached" : undefined }
  } catch (error: any) {
    return { finalUrl: currentUrl, error: error.message }
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

interface CtaLink {
  url: string
  type?: string
  finalUrl?: string
  displayUrl?: string
}

async function processLink(link: CtaLink): Promise<{ link: CtaLink; unwrapped: boolean; error?: string }> {
  // Check if link needs unwrapping: finalUrl missing OR finalUrl equals url
  if (link.finalUrl && link.finalUrl !== link.url) {
    return { link, unwrapped: false }
  }

  try {
    const result = await resolveRedirectsWithSteps(link.url)
    const finalStripped = stripQueryParams(result.finalUrl)

    return {
      link: {
        ...link,
        finalUrl: finalStripped,
        displayUrl: finalStripped,
      },
      unwrapped: true,
      error: result.error,
    }
  } catch (error: any) {
    return { link, unwrapped: false, error: error.message }
  }
}

export async function POST(request: Request) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ success: false, error: "Super admin access required" }, { status: 403 })
    }

    const { lastEmailId, lastSmsId } = await request.json()

    const BATCH_SIZE = 10

    // Fetch emails after the cursor
    const emailQuery = lastEmailId
      ? `SELECT id, "ctaLinks", "subject", "senderName" FROM "CompetitiveInsightCampaign" WHERE id > $1 AND "ctaLinks" IS NOT NULL AND "ctaLinks"::text != 'null' AND "ctaLinks"::text != '[]' ORDER BY id ASC LIMIT ${BATCH_SIZE}`
      : `SELECT id, "ctaLinks", "subject", "senderName" FROM "CompetitiveInsightCampaign" WHERE "ctaLinks" IS NOT NULL AND "ctaLinks"::text != 'null' AND "ctaLinks"::text != '[]' ORDER BY id ASC LIMIT ${BATCH_SIZE}`

    const emailParams = lastEmailId ? [lastEmailId] : []
    const emailCampaigns = await sql(emailQuery, emailParams)

    // Fetch SMS after the cursor
    const smsQuery = lastSmsId
      ? `SELECT id, "ctaLinks", "phoneNumber", message FROM "SmsQueue" WHERE id > $1 AND "ctaLinks" IS NOT NULL AND "ctaLinks"::text != 'null' AND "ctaLinks"::text != '[]' ORDER BY id ASC LIMIT ${BATCH_SIZE}`
      : `SELECT id, "ctaLinks", "phoneNumber", message FROM "SmsQueue" WHERE "ctaLinks" IS NOT NULL AND "ctaLinks"::text != 'null' AND "ctaLinks"::text != '[]' ORDER BY id ASC LIMIT ${BATCH_SIZE}`

    const smsParams = lastSmsId ? [lastSmsId] : []
    const smsMessages = await sql(smsQuery, smsParams)

    // Get total counts for progress - only count records that still need processing
    // A record needs processing if any of its ctaLinks have finalUrl missing or equal to url
    const [emailTotalResult, smsTotalResult] = await Promise.all([
      sql`
        SELECT COUNT(*) as count 
        FROM "CompetitiveInsightCampaign" 
        WHERE "ctaLinks" IS NOT NULL 
        AND "ctaLinks"::text != 'null' 
        AND "ctaLinks"::text != '[]'
        AND (
          id > ${lastEmailId || 0}
        )
      `,
      sql`
        SELECT COUNT(*) as count 
        FROM "SmsQueue" 
        WHERE "ctaLinks" IS NOT NULL 
        AND "ctaLinks"::text != 'null' 
        AND "ctaLinks"::text != '[]'
        AND (
          id > ${lastSmsId || 0}
        )
      `,
    ])

    const totalEmails = Number(emailTotalResult[0]?.count || 0)
    const totalSms = Number(smsTotalResult[0]?.count || 0)

    const results = {
      emails: {
        processed: 0,
        linksUnwrapped: 0,
        errors: [] as Array<{ id: string; subject: string; error: string }>,
        lastId: lastEmailId,
      },
      sms: {
        processed: 0,
        linksUnwrapped: 0,
        errors: [] as Array<{ id: string; phone: string; error: string }>,
        lastId: lastSmsId,
      },
      totals: {
        emails: totalEmails,
        sms: totalSms,
      },
    }

    // Process emails
    for (const campaign of emailCampaigns) {
      try {
        let links: CtaLink[] = []
        if (typeof campaign.ctaLinks === "string") {
          links = JSON.parse(campaign.ctaLinks)
        } else {
          links = campaign.ctaLinks || []
        }

        if (!Array.isArray(links) || links.length === 0) {
          results.emails.lastId = campaign.id
          continue
        }

        let anyUnwrapped = false
        let linkErrors: string[] = []
        const updatedLinks = await Promise.all(
          links.map(async (link) => {
            const result = await processLink(link)
            if (result.unwrapped) {
              anyUnwrapped = true
              results.emails.linksUnwrapped++
            }
            if (result.error) {
              linkErrors.push(`${link.url}: ${result.error}`)
            }
            return result.link
          })
        )

        // Always update with processed links
        await sql`UPDATE "CompetitiveInsightCampaign" SET "ctaLinks" = ${JSON.stringify(updatedLinks)}::jsonb WHERE id = ${campaign.id}`

        results.emails.processed++
        results.emails.lastId = campaign.id

        if (linkErrors.length > 0) {
          results.emails.errors.push({
            id: campaign.id,
            subject: campaign.subject || "No subject",
            error: linkErrors.join("; "),
          })
        }
      } catch (error: any) {
        results.emails.errors.push({
          id: campaign.id,
          subject: campaign.subject || "No subject",
          error: error.message,
        })
        results.emails.lastId = campaign.id
      }
    }

    // Process SMS
    for (const sms of smsMessages) {
      try {
        let links: CtaLink[] = []
        if (typeof sms.ctaLinks === "string") {
          links = JSON.parse(sms.ctaLinks)
        } else {
          links = sms.ctaLinks || []
        }

        if (!Array.isArray(links) || links.length === 0) {
          results.sms.lastId = sms.id
          continue
        }

        let anyUnwrapped = false
        let linkErrors: string[] = []
        const updatedLinks = await Promise.all(
          links.map(async (link) => {
            const result = await processLink(link)
            if (result.unwrapped) {
              anyUnwrapped = true
              results.sms.linksUnwrapped++
            }
            if (result.error) {
              linkErrors.push(`${link.url}: ${result.error}`)
            }
            return result.link
          })
        )

        // Always update with processed links
        await sql`UPDATE "SmsQueue" SET "ctaLinks" = ${JSON.stringify(updatedLinks)}::jsonb WHERE id = ${sms.id}`

        results.sms.processed++
        results.sms.lastId = sms.id

        if (linkErrors.length > 0) {
          results.sms.errors.push({
            id: sms.id,
            phone: sms.phoneNumber || "Unknown",
            error: linkErrors.join("; "),
          })
        }
      } catch (error: any) {
        results.sms.errors.push({
          id: sms.id,
          phone: sms.phoneNumber || "Unknown",
          error: error.message,
        })
        results.sms.lastId = sms.id
      }
    }

    const hasMoreEmails = emailCampaigns.length === BATCH_SIZE
    const hasMoreSms = smsMessages.length === BATCH_SIZE

    return NextResponse.json({
      success: true,
      results,
      hasMore: hasMoreEmails || hasMoreSms,
      message: `Processed ${results.emails.processed} emails (${results.emails.linksUnwrapped} links) and ${results.sms.processed} SMS (${results.sms.linksUnwrapped} links)`,
    })
  } catch (error: any) {
    console.error("[v0] Batch unwrap error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
