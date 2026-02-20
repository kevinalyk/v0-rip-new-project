import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import { neon } from "@neondatabase/serverless"
import https from "https"
import http from "http"
import { URL } from "url"

const sql = neon(process.env.DATABASE_URL!)

// Custom HTTPS agent that ignores SSL certificate errors
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
})

// Custom fetch using Node's http/https modules to properly handle SSL
async function customFetch(
  urlString: string,
  options: { method: string; timeout: number; headers: Record<string, string> }
): Promise<{ status: number; headers: Record<string, string | string[]>; body?: string }> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(urlString)
    const isHttps = parsedUrl.protocol === "https:"
    const lib = isHttps ? https : http

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method,
      headers: options.headers,
      rejectUnauthorized: false, // This is the key to bypassing SSL errors
      timeout: options.timeout,
    }

    const req = lib.request(requestOptions, (res) => {
      let body = ""
      res.on("data", (chunk) => {
        if (options.method === "GET") {
          body += chunk.toString()
        }
      })

      res.on("end", () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: body || undefined,
        })
      })
    })

    req.on("error", (error) => {
      reject(error)
    })

    req.on("timeout", () => {
      req.destroy()
      reject(new Error("Request timeout"))
    })

    req.end()
  })
}

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

      let response: { status: number; headers: any }
      let useCustomFetch = false

      try {
        // Try standard fetch first (works for most URLs)
        response = await fetch(currentUrl, {
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
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        
        // Check if this is a DNS/network error (should not retry)
        const isDNSError = fetchError.cause?.code === "ENOTFOUND" ||
                          fetchError.cause?.code === "ECONNREFUSED" ||
                          fetchError.cause?.code === "ECONNRESET" ||
                          fetchError.message?.includes("ENOTFOUND") ||
                          fetchError.message?.includes("ECONNREFUSED")
        
        if (isDNSError) {
          return {
            finalUrl: currentUrl,
            error: fetchError.message,
          }
        }
        
        // Check if this is an SSL/timeout error - if so, retry with custom fetch
        // Also treat generic "fetch failed" on HTTPS as potential SSL issue (but not DNS errors)
        const isSSLError = fetchError.message?.includes("certificate") || 
                          fetchError.message?.includes("SSL") || 
                          fetchError.message?.includes("TLS") ||
                          fetchError.message?.includes("self-signed") ||
                          fetchError.message?.includes("unable to verify") ||
                          fetchError.name === "AbortError" ||
                          (fetchError.message?.includes("fetch failed") && currentUrl.startsWith("https"))
        
        if (isSSLError && currentUrl.startsWith("https")) {
          // Retry with custom fetch that bypasses SSL
          try {
            response = await customFetch(currentUrl, {
              method: "HEAD",
              timeout: 10000,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
              },
            })
            useCustomFetch = true
          } catch (customFetchError) {
            // If custom fetch also fails, return error
            return {
              finalUrl: currentUrl,
              error: `Fetch failed: ${fetchError.message}`,
            }
          }
        } else {
          // Not an SSL error, return the original error
          return {
            finalUrl: currentUrl,
            error: fetchError.message,
          }
        }
      }

      try {

        if (response.status >= 300 && response.status < 400) {
          // Handle headers differently based on whether we used custom fetch
          const location = useCustomFetch 
            ? (Array.isArray(response.headers.location) ? response.headers.location[0] : response.headers.location)
            : response.headers.get("location")
          
          if (!location) {
            break
          }
          currentUrl = new URL(location, currentUrl).toString()
          redirectCount++
        } else if (response.status === 200) {
          // Check for meta/JS redirects
          let getResponse: any
          let html: string
          
          if (useCustomFetch) {
            getResponse = await customFetch(currentUrl, {
              method: "GET",
              timeout: 10000,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
            })
            html = getResponse.body || ""
          } else {
            getResponse = await fetch(currentUrl, {
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
            html = await getResponse.text()
          }

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
        } else if (response.status === 204 || response.status === 403 || response.status === 405) {
          // 204 No Content, 403 Forbidden, or 405 HEAD not allowed - try GET
          let getResponse: any
          let usedCustomFetchForGet = useCustomFetch
          
          if (useCustomFetch) {
            getResponse = await customFetch(currentUrl, {
              method: "GET",
              timeout: 10000,
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              },
            })
          } else {
            // Try standard fetch first, fall back to custom fetch on SSL errors
            try {
              getResponse = await fetch(currentUrl, {
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
            } catch (getFetchError: any) {
              // Check if this is an SSL/timeout error - if so, retry with custom fetch
              const isSSLError = getFetchError.message?.includes("certificate") || 
                                getFetchError.message?.includes("SSL") || 
                                getFetchError.message?.includes("TLS") ||
                                getFetchError.message?.includes("self-signed") ||
                                getFetchError.message?.includes("unable to verify") ||
                                getFetchError.name === "AbortError"
              
              if (isSSLError && currentUrl.startsWith("https")) {
                // Retry with custom fetch that bypasses SSL
                getResponse = await customFetch(currentUrl, {
                  method: "GET",
                  timeout: 10000,
                  headers: {
                    "User-Agent":
                      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                  },
                })
                usedCustomFetchForGet = true
              } else {
                // Not an SSL error, propagate it
                throw getFetchError
              }
            }
          }
          
          if (getResponse.status >= 300 && getResponse.status < 400) {
            const location = usedCustomFetchForGet
              ? (Array.isArray(getResponse.headers.location) ? getResponse.headers.location[0] : getResponse.headers.location)
              : getResponse.headers.get("location")
            if (location) {
              currentUrl = new URL(location, currentUrl).toString()
              redirectCount++
              continue
            }
          }

          const html = usedCustomFetchForGet ? (getResponse.body || "") : await getResponse.text()

          // Special handling for Klaviyo tracking links (ctrk.klclick1.com, klclick.com, etc.)
          if (currentUrl.includes("klclick") || currentUrl.includes("ctrk.")) {
            // Klaviyo tracking links often have the destination URL encoded in query parameters
            const klaviyoPatterns = [
              /redirect_url=([^&"']+)/i,
              /url=([^&"']+)/i,
              /target=([^&"']+)/i,
              /destination=([^&"']+)/i,
              /href=["']([^"']+)["']/i,
              /window\.location\s*=\s*["']([^"']+)["']/i,
            ]

            for (const pattern of klaviyoPatterns) {
              const match = html.match(pattern)
              if (match && match[1]) {
                try {
                  const decodedUrl = decodeURIComponent(match[1])
                  if (decodedUrl.startsWith("http")) {
                    currentUrl = decodedUrl
                    redirectCount++
                    continue
                  }
                } catch {}
              }
            }
          }

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
    
    // If there's an error, don't mark as unwrapped
    if (result.error) {
      return {
        link,
        unwrapped: false,
        error: result.error,
      }
    }
    
    const finalStripped = stripQueryParams(result.finalUrl)

    return {
      link: {
        ...link,
        finalUrl: finalStripped,
        displayUrl: finalStripped,
      },
      unwrapped: true,
      error: undefined,
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
