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
        } else if (response.status === 200) {
          // Fetch HTML body to check for JavaScript or meta redirects
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

    // Process Email Campaigns CTA Links (limit to 100 per run)
    let emailCampaigns = []
    try {
      console.log("[v0] Fetching email campaigns with ctaLinks...")
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
      console.log(`[v0] Found ${emailCampaigns.length} email campaigns with ctaLinks`)
    } catch (error: any) {
      console.error("Error fetching email campaigns:", error.message)
      
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

    console.log(`[v0] Processing ${emailCampaigns.length} email campaigns...`)
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
          console.log(`[v0] Campaign ${campaign.id}: No valid ctaLinks array, type: ${typeof campaign.ctaLinks}`)
          stats.emailCampaigns.skipped++
          continue
        }

        console.log(`[v0] Campaign ${campaign.id}: Found ${ctaLinks.length} CTA links`)
        let updated = false
        const updatedCtaLinks = []

        for (const link of ctaLinks) {
          if (link.finalUrl || link.finalURL) {
            // Already has finalUrl/finalURL, skip
            const finalUrl = link.finalURL || link.finalUrl
            console.log(`[v0] Link already unwrapped: ${link.url} -> Final: ${finalUrl}`)
            updatedCtaLinks.push(link)
            continue
          }

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

            // Small delay to avoid rate limiting
            await sleep(100)
          } catch (error) {
            // Failed to unwrap, keep original
            updatedCtaLinks.push(link)
            stats.emailCampaigns.failed++
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

    // Process SMS Messages CTA Links (limit to 100 per run)
    let smsMessages = []
    try {
      console.log("[v0] Fetching SMS messages with ctaLinks...")
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
      console.log(`[v0] Found ${smsMessages.length} SMS messages with ctaLinks`)
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
            // Already has finalUrl/finalURL, skip
            updatedCtaLinks.push(link)
            continue
          }

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

            // Small delay to avoid rate limiting
            await sleep(100)
          } catch (error) {
            // Failed to unwrap, keep original
            updatedCtaLinks.push(link)
            stats.smsMessages.failed++
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

    console.log("[v0] Unwrap links cron job completed:", JSON.stringify(stats, null, 2))
    return NextResponse.json({
      success: true,
      stats,
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
