import { NextResponse } from "next/server"
import prisma, { ensureDatabaseConnection } from "@/lib/prisma"
import https from "https"
import http from "http"
import { URL } from "url"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 minutes

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
      rejectUnauthorized: false, // Bypass SSL errors
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

async function resolveRedirects(url: string): Promise<string> {
  const maxRedirects = 10
  let currentUrl = url
  let redirectCount = 0

  try {
    while (redirectCount < maxRedirects) {
      try {
        const response = await customFetch(currentUrl, {
          method: "HEAD",
          timeout: 10000,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
          },
        })

        if (response.status >= 300 && response.status < 400) {
          const locationHeader = response.headers.location
          const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader

          if (!location) {
            break
          }

          const nextUrl = new URL(location, currentUrl).toString()
          currentUrl = nextUrl
          redirectCount++
        } else if (response.status === 200 || response.status === 404 || (currentUrl.includes("klclick") || currentUrl.includes("ctrk."))) {
          // Fetch HTML body to check for JavaScript or meta redirects
          // Also fetch for 404 or Klaviyo links since they may have redirects in HTML
          const getResponse = await customFetch(currentUrl, {
            method: "GET",
            timeout: 10000,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
          })

          const html = getResponse.body || ""

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

          // Special handling for HubSpot links - look for their specific redirect pattern
          if (currentUrl.includes("hubspotlinks.com")) {
            // HubSpot uses JavaScript variables to store redirect URLs
            // Look for: var targetURL = "https://..."
            const targetURLPattern = /var\s+targetURL\s*=\s*"([^"]+)"/i
            const targetURLMatch = html.match(targetURLPattern)

            if (targetURLMatch && targetURLMatch[1]) {
              const nextUrl = targetURLMatch[1]
              currentUrl = nextUrl
              redirectCount++
              continue
            }

            // Also try other HubSpot patterns
            const hubspotPatterns = [
              /data-redirect-url=["']([^"']+)["']/i,
              /data-target=["']([^"']+)["']/i,
              /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*redirect/i,
              /<form[^>]*action=["']([^"']+)["']/i,
            ]

            for (const pattern of hubspotPatterns) {
              const match = html.match(pattern)
              if (match && match[1]) {
                const nextUrl = new URL(match[1], currentUrl).toString()
                currentUrl = nextUrl
                redirectCount++
                continue
              }
            }
          }

          // Check for meta refresh redirects
          const metaPatterns = [
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?/i,
            /<meta[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?[^>]*http-equiv=["']?refresh["']?/i,
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*URL=([^"'>]+)["']?/i,
          ]

          let metaMatch = null
          for (const pattern of metaPatterns) {
            metaMatch = html.match(pattern)
            if (metaMatch) {
              break
            }
          }

          if (metaMatch && metaMatch[1]) {
            const nextUrl = new URL(metaMatch[1], currentUrl).toString()
            currentUrl = nextUrl
            redirectCount++
            continue
          }

          // Check for JavaScript redirects
          const jsPatterns = [
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
            /location\.replace\(["']([^"']+)["']\)/i,
            /window\.location\.replace\(["']([^"']+)["']\)/i,
          ]

          let jsMatch = null
          for (const pattern of jsPatterns) {
            jsMatch = html.match(pattern)
            if (jsMatch) {
              break
            }
          }

          if (jsMatch && jsMatch[1]) {
            const nextUrl = new URL(jsMatch[1], currentUrl).toString()
            currentUrl = nextUrl
            redirectCount++
            continue
          }

          // No redirect found - this is the final destination
          return currentUrl
        } else if (response.status === 204 || response.status === 403 || response.status === 405) {
          // Try GET instead of HEAD
          const getResponse = await customFetch(currentUrl, {
            method: "GET",
            timeout: 10000,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
          })

          if (getResponse.status >= 300 && getResponse.status < 400) {
            const locationHeader = getResponse.headers.location
            const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader
            if (location) {
              const nextUrl = new URL(location, currentUrl).toString()
              currentUrl = nextUrl
              redirectCount++
              continue
            }
          }

          const html = getResponse.body || ""

          // Check for meta refresh
          const metaPatterns = [
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?/i,
            /<meta[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?[^>]*http-equiv=["']?refresh["']?/i,
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*URL=([^"'>]+)["']?/i,
          ]

          let metaMatch = null
          for (const pattern of metaPatterns) {
            metaMatch = html.match(pattern)
            if (metaMatch) {
              break
            }
          }

          if (metaMatch && metaMatch[1]) {
            const nextUrl = new URL(metaMatch[1], currentUrl).toString()
            currentUrl = nextUrl
            redirectCount++
            continue
          }

          // Check for JS redirects
          const jsPatterns = [
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
            /location\.replace\(["']([^"']+)["']\)/i,
            /window\.location\.replace\(["']([^"']+)["']\)/i,
          ]

          let jsMatch = null
          for (const pattern of jsPatterns) {
            jsMatch = html.match(pattern)
            if (jsMatch) {
              break
            }
          }

          if (jsMatch && jsMatch[1]) {
            const nextUrl = new URL(jsMatch[1], currentUrl).toString()
            currentUrl = nextUrl
            redirectCount++
            continue
          }

          return currentUrl
        } else {
          // Unexpected status - return current URL
          return currentUrl
        }
      } catch (error: any) {
        // Error fetching - return current URL
        return currentUrl
      }
    }

    // Max redirects reached
    return currentUrl
  } catch (error: any) {
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

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const dbConnected = await ensureDatabaseConnection()
    if (!dbConnected) {
      return NextResponse.json(
        {
          error: "Database connection failed",
          details: "Could not establish connection to database",
        },
        { status: 500 }
      )
    }

    const stats = {
      emailCampaigns: {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      },
      smsMessages: {
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      },
    }

    // Get or create cursor state for this cron job
    let cronState = await prisma.cronJobState.findUnique({
      where: { jobName: "unwrap-links" },
    })

    if (!cronState) {
      console.log("[v0] Unwrap Links Cron: No state found, creating initial state")
      cronState = await prisma.cronJobState.create({
        data: {
          jobName: "unwrap-links",
          lastProcessedEmailId: null,
          lastProcessedSmsId: null,
        },
      })
    }

    console.log("[v0] Unwrap Links Cron: Current cursor state:", {
      lastProcessedEmailId: cronState.lastProcessedEmailId,
      lastProcessedSmsId: cronState.lastProcessedSmsId,
    })

    // Process Email Campaigns CTA Links (limit to 100 per run, cursor-based)
    let emailCampaigns = []
    try {
      console.log("[v0] Unwrap Links Cron: Starting - fetching email campaigns...")
      
      // Use cursor-based pagination to get next batch
      const whereClause: any = {
        ctaLinks: { not: null },
      }

      // If we have a cursor, start from there
      if (cronState.lastProcessedEmailId) {
        whereClause.id = { gt: cronState.lastProcessedEmailId }
      }

      emailCampaigns = await prisma.competitiveInsightCampaign.findMany({
        where: whereClause,
        take: 100,
        orderBy: {
          id: "asc", // Changed to ascending to go through database sequentially
        },
      })

      // If no campaigns found and we had a cursor, reset and try from beginning
      if (emailCampaigns.length === 0 && cronState.lastProcessedEmailId) {
        console.log("[v0] Unwrap Links Cron: Reached end of campaigns, resetting cursor to start over")
        await prisma.cronJobState.update({
          where: { jobName: "unwrap-links" },
          data: { lastProcessedEmailId: null },
        })
        
        // Fetch from beginning
        emailCampaigns = await prisma.competitiveInsightCampaign.findMany({
          where: { ctaLinks: { not: null } },
          take: 100,
          orderBy: { id: "asc" },
        })
      }

      console.log(`[v0] Unwrap Links Cron: Found ${emailCampaigns.length} email campaigns to process`)
    } catch (error: any) {
      console.error("[v0] Unwrap Links Cron: Error fetching email campaigns:", error.message)
      
      // Try to reconnect and retry once
      const reconnected = await ensureDatabaseConnection()
      if (reconnected) {
        try {
          emailCampaigns = await prisma.competitiveInsightCampaign.findMany({
            where: {
              ctaLinks: {
                not: null,
              },
            },
            take: 100,
            orderBy: {
              createdAt: "desc",
            },
          })
        } catch (retryError: any) {
          console.error("Retry failed:", retryError.message)
          return NextResponse.json(
            {
              error: "Database connection failed during email campaigns fetch",
              details: retryError.message,
            },
            { status: 500 }
          )
        }
      } else {
        return NextResponse.json(
          {
            error: "Could not reconnect to database",
            details: error.message,
          },
          { status: 500 }
        )
      }
    }

    for (const campaign of emailCampaigns) {
      try {
        // Handle ctaLinks - could be array, JSON object, or string
        let ctaLinks: any[]
        if (Array.isArray(campaign.ctaLinks)) {
          ctaLinks = campaign.ctaLinks
        } else if (typeof campaign.ctaLinks === 'string') {
          ctaLinks = JSON.parse(campaign.ctaLinks)
        } else if (campaign.ctaLinks && typeof campaign.ctaLinks === 'object') {
          // It's a JSON object from Prisma, try to use it directly or check if it has array-like properties
          ctaLinks = campaign.ctaLinks as any[]
        } else {
          ctaLinks = []
        }

        if (!Array.isArray(ctaLinks) || ctaLinks.length === 0) {
          stats.emailCampaigns.skipped++
          continue
        }

        let updated = false
        const updatedCtaLinks = []

        for (const link of ctaLinks) {
          if (link.finalUrl || link.finalURL) {
            // Already has finalUrl/finalURL, skip silently
            updatedCtaLinks.push(link)
            continue
          }

          // Found a link that needs unwrapping
          stats.emailCampaigns.processed++

          try {
            const finalURL = await resolveRedirects(link.url)
            const strippedFinalURL = stripQueryParams(finalURL)

            updatedCtaLinks.push({
              ...link,
              finalURL: finalURL,
              strippedFinalURL: strippedFinalURL,
            })

            updated = true
            stats.emailCampaigns.succeeded++
            console.log(`[v0] Unwrap Links Cron: Email Campaign ID ${campaign.id} - SUCCESS - ${link.url} → ${finalURL}`)

            // Small delay to avoid rate limiting
            await sleep(100)
          } catch (error) {
            // Failed to unwrap, keep original
            updatedCtaLinks.push(link)
            stats.emailCampaigns.failed++
            console.log(`[v0] Unwrap Links Cron: Email Campaign ID ${campaign.id} - FAILED - ${link.url} (${error instanceof Error ? error.message : 'Unknown error'})`)
          }
        }

        // Update campaign if any links were unwrapped
        if (updated) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: { ctaLinks: updatedCtaLinks },
          })
        } else {
          stats.emailCampaigns.skipped++
        }
      } catch (error) {
        stats.emailCampaigns.failed++
      }
    }

    // Update cursor to last processed email campaign ID
    if (emailCampaigns.length > 0) {
      const lastProcessedId = emailCampaigns[emailCampaigns.length - 1].id
      await prisma.cronJobState.update({
        where: { jobName: "unwrap-links" },
        data: {
          lastProcessedEmailId: lastProcessedId,
          lastRunAt: new Date(),
        },
      })
      console.log(`[v0] Unwrap Links Cron: Updated email cursor to ${lastProcessedId}`)
    }

    // Process SMS Messages CTA Links (limit to 100 per run, cursor-based)
    let smsMessages = []
    try {
      console.log("[v0] Unwrap Links Cron: Fetching SMS messages...")
      
      // Refresh cronState to get latest cursor
      const latestCronState = await prisma.cronJobState.findUnique({
        where: { jobName: "unwrap-links" },
      })

      const smsWhereClause: any = {
        ctaLinks: { not: null },
      }

      // If we have a cursor, start from there
      if (latestCronState?.lastProcessedSmsId) {
        smsWhereClause.id = { gt: latestCronState.lastProcessedSmsId }
      }

      smsMessages = await prisma.smsQueue.findMany({
        where: smsWhereClause,
        take: 100,
        orderBy: {
          id: "asc", // Changed to ascending for sequential processing
        },
      })

      // If no messages found and we had a cursor, reset and try from beginning
      if (smsMessages.length === 0 && latestCronState?.lastProcessedSmsId) {
        console.log("[v0] Unwrap Links Cron: Reached end of SMS messages, resetting cursor to start over")
        await prisma.cronJobState.update({
          where: { jobName: "unwrap-links" },
          data: { lastProcessedSmsId: null },
        })
        
        // Fetch from beginning
        smsMessages = await prisma.smsQueue.findMany({
          where: { ctaLinks: { not: null } },
          take: 100,
          orderBy: { id: "asc" },
        })
      }

      console.log(`[v0] Unwrap Links Cron: Found ${smsMessages.length} SMS messages to process`)
    } catch (error: any) {
      console.error("Error fetching SMS messages:", error.message)
      
      // Try to reconnect and retry once
      const reconnected = await ensureDatabaseConnection()
      if (reconnected) {
        try {
          smsMessages = await prisma.smsQueue.findMany({
            where: {
              ctaLinks: {
                not: null,
              },
            },
            take: 100,
            orderBy: {
              createdAt: "desc",
            },
          })
        } catch (retryError: any) {
          console.error("Retry failed:", retryError.message)
          // Continue with empty array instead of failing completely
          console.log("Continuing without SMS messages...")
        }
      } else {
        console.log("Could not reconnect, continuing without SMS messages...")
      }
    }

    for (const sms of smsMessages) {
      try {
        if (!sms.ctaLinks) {
          stats.smsMessages.skipped++
          continue
        }

        // Handle ctaLinks - could be array, JSON object, or string
        let ctaLinks: any[]
        if (Array.isArray(sms.ctaLinks)) {
          ctaLinks = sms.ctaLinks
        } else if (typeof sms.ctaLinks === 'string') {
          ctaLinks = JSON.parse(sms.ctaLinks)
        } else if (typeof sms.ctaLinks === 'object') {
          // It's a JSON object from Prisma, try to use it directly
          ctaLinks = sms.ctaLinks as any[]
        } else {
          ctaLinks = []
        }

        if (!Array.isArray(ctaLinks) || ctaLinks.length === 0) {
          stats.smsMessages.skipped++
          continue
        }

        let updated = false
        const updatedCtaLinks = []

        for (const link of ctaLinks) {
          if (link.finalUrl || link.finalURL) {
            // Already has finalUrl/finalURL, skip silently
            updatedCtaLinks.push(link)
            continue
          }

          // Found a link that needs unwrapping
          stats.smsMessages.processed++

          try {
            const finalURL = await resolveRedirects(link.url)
            const strippedFinalURL = stripQueryParams(finalURL)

            updatedCtaLinks.push({
              ...link,
              finalURL: finalURL,
              strippedFinalURL: strippedFinalURL,
            })

            updated = true
            stats.smsMessages.succeeded++
            console.log(`[v0] Unwrap Links Cron: SMS ID ${sms.id} - SUCCESS - ${link.url} → ${finalURL}`)

            // Small delay to avoid rate limiting
            await sleep(100)
          } catch (error) {
            // Failed to unwrap, keep original
            updatedCtaLinks.push(link)
            stats.smsMessages.failed++
            console.log(`[v0] Unwrap Links Cron: SMS ID ${sms.id} - FAILED - ${link.url} (${error instanceof Error ? error.message : 'Unknown error'})`)
          }
        }

        // Update SMS if any links were unwrapped
        if (updated) {
          await prisma.smsQueue.update({
            where: { id: sms.id },
            data: { ctaLinks: JSON.stringify(updatedCtaLinks) },
          })
        } else {
          stats.smsMessages.skipped++
        }
      } catch (error) {
        stats.smsMessages.failed++
      }
    }

    // Update cursor to last processed SMS message ID
    if (smsMessages.length > 0) {
      const lastProcessedSmsId = smsMessages[smsMessages.length - 1].id
      await prisma.cronJobState.update({
        where: { jobName: "unwrap-links" },
        data: {
          lastProcessedSmsId: lastProcessedSmsId,
          lastRunAt: new Date(),
        },
      })
      console.log(`[v0] Unwrap Links Cron: Updated SMS cursor to ${lastProcessedSmsId}`)
    }

    // Get final cursor state for logging
    const finalCronState = await prisma.cronJobState.findUnique({
      where: { jobName: "unwrap-links" },
    })

    console.log("[v0] Unwrap Links Cron: Completed - Stats:", JSON.stringify(stats, null, 2))
    console.log("[v0] Unwrap Links Cron: Final cursor state:", {
      lastProcessedEmailId: finalCronState?.lastProcessedEmailId,
      lastProcessedSmsId: finalCronState?.lastProcessedSmsId,
    })

    return NextResponse.json({
      success: true,
      stats,
      cursorState: {
        lastProcessedEmailId: finalCronState?.lastProcessedEmailId,
        lastProcessedSmsId: finalCronState?.lastProcessedSmsId,
      },
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to unwrap links",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return GET(request)
}
