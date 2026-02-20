import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import https from "https"
import http from "http"
import { URL } from "url"

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

    console.log("[v0] customFetch: Fetching", urlString, "with method", options.method)

    const requestOptions = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method,
      headers: options.headers,
      rejectUnauthorized: false, // This is the key to bypassing SSL errors
      timeout: options.timeout,
    }

    console.log("[v0] customFetch: Request options", {
      hostname: requestOptions.hostname,
      port: requestOptions.port,
      path: requestOptions.path,
      method: requestOptions.method,
      rejectUnauthorized: requestOptions.rejectUnauthorized,
    })

    const req = lib.request(requestOptions, (res) => {
      console.log("[v0] customFetch: Response status", res.statusCode)
      console.log("[v0] customFetch: Response headers", res.headers)

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
      console.log("[v0] customFetch: Request error", error)
      reject(error)
    })

    req.on("timeout", () => {
      req.destroy()
      reject(new Error("Request timeout"))
    })

    req.end()
  })
}

async function resolveRedirectsWithSteps(url: string): Promise<{
  finalUrl: string
  steps: Array<{
    step: number
    url: string
    status: number
    redirectType?: string
    timing: number
    htmlSnippet?: string
  }>
  totalTime: number
  error?: string
}> {
  const maxRedirects = 10
  let currentUrl = url
  let redirectCount = 0
  const steps: Array<{
    step: number
    url: string
    status: number
    redirectType?: string
    timing: number
    htmlSnippet?: string
  }> = []
  const startTime = Date.now()

  try {
    while (redirectCount < maxRedirects) {
      const stepStartTime = Date.now()
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // Reduced to 10s for faster feedback

      try {
        console.log("[v0] About to fetch:", currentUrl)
        
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
        
        console.log("[v0] Fetch successful, status:", response.status)

        clearTimeout(timeoutId)
        const stepEndTime = Date.now()
        const timing = stepEndTime - stepStartTime

        if (response.status >= 300 && response.status < 400) {
          const locationHeader = response.headers.location
          const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader
          
          if (!location) {
            steps.push({
              step: redirectCount + 1,
              url: currentUrl,
              status: response.status,
              redirectType: "No location header - trying GET",
              timing,
            })
            break
          }

          const nextUrl = new URL(location, currentUrl).toString()
          steps.push({
            step: redirectCount + 1,
            url: currentUrl,
            status: response.status,
            redirectType: `${response.status} redirect`,
            timing,
          })

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
          const htmlSnippet = html.substring(0, 1000) // Increased to 1000 chars for debugging

          console.log("[v0] Checking HTML for redirects. HTML length:", html.length)
          console.log("[v0] HTML preview (first 1000 chars):", htmlSnippet)
          
          // Special handling for Klaviyo tracking links (ctrk.klclick1.com, klclick.com, etc.)
          if (currentUrl.includes("klclick") || currentUrl.includes("ctrk.")) {
            console.log("[v0] Klaviyo tracking link detected - checking for Klaviyo-specific patterns")
            
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
                    console.log("[v0] Klaviyo redirect found:", decodedUrl)
                    steps.push({
                      step: redirectCount + 1,
                      url: currentUrl,
                      status: response.status,
                      redirectType: "Klaviyo tracking redirect",
                      timing,
                      htmlSnippet,
                    })
                    currentUrl = decodedUrl
                    redirectCount++
                    continue
                  }
                } catch {}
              }
            }
            
            console.log("[v0] No Klaviyo redirect pattern found")
          }
          
          // Special handling for HubSpot links - look for their specific redirect pattern
          if (currentUrl.includes('hubspotlinks.com')) {
            console.log("[v0] HubSpot link detected - checking for HubSpot-specific patterns")
            
            // HubSpot uses JavaScript variables to store redirect URLs
            // Look for: var targetURL = "https://..."
            const targetURLPattern = /var\s+targetURL\s*=\s*"([^"]+)"/i
            const targetURLMatch = html.match(targetURLPattern)
            
            if (targetURLMatch && targetURLMatch[1]) {
              console.log("[v0] HubSpot targetURL found:", targetURLMatch[1])
              const nextUrl = targetURLMatch[1]
              console.log("[v0] Following HubSpot JavaScript redirect to:", nextUrl)
              steps.push({
                step: redirectCount + 1,
                url: currentUrl,
                status: response.status,
                redirectType: "HubSpot JavaScript redirect (targetURL)",
                timing,
                htmlSnippet,
              })
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
                console.log("[v0] HubSpot redirect pattern match:", match[1])
                const nextUrl = new URL(match[1], currentUrl).toString()
                console.log("[v0] Following HubSpot redirect to:", nextUrl)
                steps.push({
                  step: redirectCount + 1,
                  url: currentUrl,
                  status: response.status,
                  redirectType: "HubSpot data redirect",
                  timing,
                  htmlSnippet,
                })
                currentUrl = nextUrl
                redirectCount++
                continue
              }
            }
            
            console.log("[v0] No HubSpot redirect pattern found")
          }

          const metaPatterns = [
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?/i,
            /<meta[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?[^>]*http-equiv=["']?refresh["']?/i,
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*URL=([^"'>]+)["']?/i,
          ]

          let metaMatch = null
          for (const pattern of metaPatterns) {
            metaMatch = html.match(pattern)
            if (metaMatch) {
              console.log("[v0] Meta refresh match found with pattern:", pattern.toString())
              console.log("[v0] Extracted URL:", metaMatch[1])
              break
            }
          }

          if (metaMatch && metaMatch[1]) {
            const nextUrl = new URL(metaMatch[1], currentUrl).toString()
            console.log("[v0] Following meta refresh to:", nextUrl)
            steps.push({
              step: redirectCount + 1,
              url: currentUrl,
              status: response.status,
              redirectType: "Meta refresh redirect",
              timing,
              htmlSnippet,
            })
            currentUrl = nextUrl
            redirectCount++
            continue
          }

          const jsPatterns = [
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
            /location\.replace\s*$$\s*["']([^"']+)["']\s*$$/i,
            /window\.location\.replace\s*$$\s*["']([^"']+)["']\s*$$/i,
          ]

          let jsMatch = null
          for (const pattern of jsPatterns) {
            jsMatch = html.match(pattern)
            if (jsMatch) {
              console.log("[v0] JavaScript redirect match found with pattern:", pattern.toString())
              console.log("[v0] Extracted URL:", jsMatch[1])
              break
            }
          }

          if (jsMatch && jsMatch[1]) {
            const nextUrl = new URL(jsMatch[1], currentUrl).toString()
            console.log("[v0] Following JS redirect to:", nextUrl)
            steps.push({
              step: redirectCount + 1,
              url: currentUrl,
              status: response.status,
              redirectType: "JavaScript redirect",
              timing,
              htmlSnippet,
            })
            currentUrl = nextUrl
            redirectCount++
            continue
          }

          console.log("[v0] No client-side redirects found in HTML")

          // No redirect found - this is the final destination
          steps.push({
            step: redirectCount + 1,
            url: currentUrl,
            status: response.status,
            redirectType: "Final destination via GET",
            timing,
            htmlSnippet,
          })
          return {
            finalUrl: currentUrl,
            steps,
            totalTime: Date.now() - startTime,
          }
        } else if (response.status === 204 || response.status === 403 || response.status === 405) {
          steps.push({
            step: redirectCount + 1,
            url: currentUrl,
            status: response.status,
            redirectType: response.status === 204 
              ? "No content (204) - trying GET" 
              : response.status === 403
              ? "Forbidden (403) - trying GET"
              : "HEAD not allowed - trying GET",
            timing,
          })

          const getStepStartTime = Date.now()
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
          const getTiming = Date.now() - getStepStartTime

          if (getResponse.status >= 300 && getResponse.status < 400) {
            const locationHeader = getResponse.headers.location
            const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader
            if (location) {
              const nextUrl = new URL(location, currentUrl).toString()
              steps.push({
                step: redirectCount + 2,
                url: currentUrl,
                status: getResponse.status,
                redirectType: `${getResponse.status} redirect via GET`,
                timing: getTiming,
              })
              currentUrl = nextUrl
              redirectCount++
              continue
            }
          }

          const html = getResponse.body || ""
          const htmlSnippet = html.substring(0, 1000)

          console.log("[v0] After 405 - Checking HTML for redirects. HTML length:", html.length)
          console.log("[v0] HTML preview (first 1000 chars):", htmlSnippet)

          const metaPatterns = [
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?/i,
            /<meta[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?[^>]*http-equiv=["']?refresh["']?/i,
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*URL=([^"'>]+)["']?/i,
          ]

          let metaMatch = null
          for (const pattern of metaPatterns) {
            metaMatch = html.match(pattern)
            if (metaMatch) {
              console.log("[v0] Meta refresh match found (after 405) with pattern:", pattern.toString())
              console.log("[v0] Extracted URL:", metaMatch[1])
              break
            }
          }

          if (metaMatch && metaMatch[1]) {
            const nextUrl = new URL(metaMatch[1], currentUrl).toString()
            console.log("[v0] Following meta refresh to:", nextUrl)
            steps.push({
              step: redirectCount + 2,
              url: currentUrl,
              status: getResponse.status,
              redirectType: "Meta refresh redirect (after 405)",
              timing: getTiming,
              htmlSnippet,
            })
            currentUrl = nextUrl
            redirectCount++
            continue
          }

          const jsPatterns = [
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
            /location\.replace\s*$$\s*["']([^"']+)["']\s*$$/i,
            /window\.location\.replace\s*$$\s*["']([^"']+)["']\s*$$/i,
          ]

          let jsMatch = null
          for (const pattern of jsPatterns) {
            jsMatch = html.match(pattern)
            if (jsMatch) {
              console.log("[v0] JavaScript redirect match found (after 405) with pattern:", pattern.toString())
              console.log("[v0] Extracted URL:", jsMatch[1])
              break
            }
          }

          if (jsMatch && jsMatch[1]) {
            const nextUrl = new URL(jsMatch[1], currentUrl).toString()
            console.log("[v0] Following JS redirect to:", nextUrl)
            steps.push({
              step: redirectCount + 2,
              url: currentUrl,
              status: getResponse.status,
              redirectType: "JavaScript redirect (after 405)",
              timing: getTiming,
              htmlSnippet,
            })
            currentUrl = nextUrl
            redirectCount++
            continue
          }

          console.log("[v0] No client-side redirects found in HTML (after 405)")

          steps.push({
            step: redirectCount + 2,
            url: currentUrl,
            status: getResponse.status,
            redirectType: "Final destination via GET",
            timing: getTiming,
            htmlSnippet,
          })

          return {
            finalUrl: currentUrl,
            steps,
            totalTime: Date.now() - startTime,
          }
        } else {
          steps.push({
            step: redirectCount + 1,
            url: currentUrl,
            status: response.status,
            redirectType: `Unexpected status ${response.status}`,
            timing,
          })
          return {
            finalUrl: currentUrl,
            steps,
            totalTime: Date.now() - startTime,
          }
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        const stepEndTime = Date.now()
        const timing = stepEndTime - stepStartTime
        
        console.log("[v0] Fetch error caught in loop:", fetchError.message)
        console.log("[v0] Error name:", fetchError.name)
        
        // Check if this is an SSL/TLS error
        const isSSLError = fetchError.message?.includes("certificate") || 
                          fetchError.message?.includes("SSL") || 
                          fetchError.message?.includes("TLS") ||
                          fetchError.message?.includes("self-signed") ||
                          fetchError.message?.includes("unable to verify")
        
        if (fetchError.name === "AbortError") {
          steps.push({
            step: redirectCount + 1,
            url: currentUrl,
            status: 0,
            redirectType: "Request timeout (10s) - possible SSL issue",
            timing,
            htmlSnippet: isSSLError ? "SSL certificate error prevented connection" : undefined,
          })
          // Mark as error but still return current URL as final since we can't go further
          return {
            finalUrl: currentUrl,
            steps,
            totalTime: Date.now() - startTime,
            hasError: true,
            error: "Request timeout (SSL certificate issue likely)",
          }
        }
        
        steps.push({
          step: redirectCount + 1,
          url: currentUrl,
          status: 0,
          redirectType: `Fetch error: ${fetchError.message}${isSSLError ? " (SSL)" : ""}`,
          timing,
          htmlSnippet: isSSLError ? "This URL has SSL certificate issues but may still be valid" : undefined,
        })
        // Mark as error but return current URL as final
        return {
          finalUrl: currentUrl,
          steps,
          totalTime: Date.now() - startTime,
          hasError: true,
          error: `${fetchError.message}${isSSLError ? " - URL has SSL issues but may be accessible in browser" : ""}`,
        }
      }
    }

    steps.push({
      step: redirectCount + 1,
      url: currentUrl,
      status: 0,
      redirectType: "Max redirects reached (10)",
      timing: 0,
    })

    return {
      finalUrl: currentUrl,
      steps,
      totalTime: Date.now() - startTime,
      error: "Max redirects (10) reached",
    }
  } catch (error: any) {
    console.log("[v0] Top-level catch in resolveRedirectsWithSteps:", error)
    console.log("[v0] Error type:", error?.constructor?.name)
    console.log("[v0] Error message:", error?.message)
    console.log("[v0] Error stack:", error?.stack)
    if (error && 'cause' in error) {
      console.log("[v0] Error cause:", error.cause)
    }
    return {
      finalUrl: currentUrl,
      steps,
      totalTime: Date.now() - startTime,
      error: error.message,
    }
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
    console.log("[v0] Test unwrap URL API called")

    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      console.log("[v0] Unauthorized request")
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
    }

    const { url } = await request.json()

    console.log("[v0] URL received:", url)

    if (!url) {
      console.log("[v0] No URL provided")
      return NextResponse.json({ success: false, error: "URL is required" }, { status: 400 })
    }

    // Validate URL format
    try {
      new URL(url)
      console.log("[v0] URL format valid")
    } catch {
      console.log("[v0] Invalid URL format")
      return NextResponse.json({ success: false, error: "Invalid URL format" }, { status: 400 })
    }

    console.log(`[v0] Starting redirect resolution for: ${url}`)

    // Step 1: Resolve redirects with detailed steps
    const redirectResult = await resolveRedirectsWithSteps(url)

    console.log("[v0] Redirect resolution complete:", {
      finalUrl: redirectResult.finalUrl,
      steps: redirectResult.steps.length,
      totalTime: redirectResult.totalTime,
      hasError: !!redirectResult.error,
    })

    // Log each step
    redirectResult.steps.forEach((step, i) => {
      console.log(`[v0] Step ${i + 1}:`, {
        url: step.url,
        status: step.status,
        redirectType: step.redirectType,
        hasHtml: !!step.htmlSnippet,
      })
      if (step.htmlSnippet) {
        console.log(`[v0] Step ${i + 1} HTML snippet:`, step.htmlSnippet.substring(0, 200))
      }
    })

    // Step 2: Strip query params from original and final
    const originalStripped = stripQueryParams(url)
    const finalStripped = stripQueryParams(redirectResult.finalUrl)

    console.log("[v0] Query param stripping:", {
      originalStripped,
      finalStripped,
      changed: finalStripped !== originalStripped,
    })

    const result = {
      success: true,
      original: {
        url,
        stripped: originalStripped,
        hasQueryParams: url !== originalStripped,
      },
      redirectChain: {
        steps: redirectResult.steps,
        totalSteps: redirectResult.steps.length,
        totalTime: redirectResult.totalTime,
        error: redirectResult.error,
      },
      final: {
        url: redirectResult.finalUrl,
        stripped: finalStripped,
        hasQueryParams: redirectResult.finalUrl !== finalStripped,
        changed: finalStripped !== originalStripped,
      },
      summary: {
        originalUrl: url,
        finalUrl: finalStripped,
        redirects: redirectResult.steps.length - 1,
        totalTime: `${redirectResult.totalTime}ms`,
        changed: finalStripped !== originalStripped,
      },
    }

    console.log(`[v0] Test unwrap complete - returning result`)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error("[v0] Error in test unwrap:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
