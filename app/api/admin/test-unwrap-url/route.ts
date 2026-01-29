import { NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"

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
        })

        clearTimeout(timeoutId)
        const stepEndTime = Date.now()
        const timing = stepEndTime - stepStartTime

        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location")
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
        } else if (response.status === 200) {
          // Fetch HTML body to check for JavaScript or meta redirects
          const getResponse = await fetch(currentUrl, {
            method: "GET",
            redirect: "manual",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
            signal: controller.signal,
          })

          const html = await getResponse.text()
          const htmlSnippet = html.substring(0, 1000) // Increased to 1000 chars for debugging

          console.log("[v0] Checking HTML for redirects. HTML length:", html.length)
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
        } else if (response.status === 405) {
          steps.push({
            step: redirectCount + 1,
            url: currentUrl,
            status: response.status,
            redirectType: "HEAD not allowed - trying GET",
            timing,
          })

          const getStepStartTime = Date.now()
          const getResponse = await fetch(currentUrl, {
            method: "GET",
            redirect: "manual",
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "en-US,en;q=0.5",
            },
            signal: controller.signal,
          })
          const getTiming = Date.now() - getStepStartTime

          if (getResponse.status >= 300 && getResponse.status < 400) {
            const location = getResponse.headers.get("location")
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

          const html = await getResponse.text()
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

        if (fetchError.name === "AbortError") {
          steps.push({
            step: redirectCount + 1,
            url: currentUrl,
            status: 0,
            redirectType: "Request timeout (30s)",
            timing,
          })
          return {
            finalUrl: currentUrl,
            steps,
            totalTime: Date.now() - startTime,
            error: "Request timeout after 30 seconds",
          }
        }

        steps.push({
          step: redirectCount + 1,
          url: currentUrl,
          status: 0,
          redirectType: `Fetch error: ${fetchError.message}`,
          timing,
        })
        return {
          finalUrl: currentUrl,
          steps,
          totalTime: Date.now() - startTime,
          error: fetchError.message,
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
