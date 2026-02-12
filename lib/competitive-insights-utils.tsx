import prisma from "@/lib/prisma"
import { generateText } from "ai"
import * as cheerio from "cheerio"
import { sanitizeSubject } from "@/lib/campaign-detector"
import https from "https"
import http from "http"
import { URL } from "url"

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

/**
 * Resolve redirect chain and get final destination URL
 * Uses HEAD requests to avoid downloading full pages, falls back to GET if needed
 * Handles SSL certificate errors and various status codes (200, 204, 403, 405)
 */
export async function resolveRedirects(url: string, maxRedirects = 10): Promise<string> {
  let currentUrl = url
  let redirectCount = 0

  try {
    while (redirectCount < maxRedirects) {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

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
        })

        clearTimeout(timeoutId)
      } catch (fetchError: any) {
        clearTimeout(timeoutId)

        // Check if this is a DNS/network error (should not retry)
        const isDNSError =
          fetchError.cause?.code === "ENOTFOUND" ||
          fetchError.cause?.code === "ECONNREFUSED" ||
          fetchError.cause?.code === "ECONNRESET" ||
          fetchError.message?.includes("ENOTFOUND") ||
          fetchError.message?.includes("ECONNREFUSED")

        if (isDNSError) {
          return currentUrl
        }

        // Check if this is an SSL/timeout error - if so, retry with custom fetch
        const isSSLError =
          fetchError.message?.includes("certificate") ||
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
            return currentUrl
          }
        } else {
          return currentUrl
        }
      }

      try {
        if (response.status >= 300 && response.status < 400) {
          // Handle headers differently based on whether we used custom fetch
          const location = useCustomFetch
            ? Array.isArray(response.headers.location)
              ? response.headers.location[0]
              : response.headers.location
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
            })
            html = await getResponse.text()
          }

          // Special handling for HubSpot links - they use JavaScript variables
          if (currentUrl.includes('hubspotlinks.com')) {
            const targetURLPattern = /var\s+targetURL\s*=\s*"([^"]+)"/i
            const targetURLMatch = html.match(targetURLPattern)
            
            if (targetURLMatch && targetURLMatch[1]) {
              currentUrl = targetURLMatch[1]
              redirectCount++
              continue
            }
          }

          // Check for meta refresh redirects
          const metaRefreshPatterns = [
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?/i,
            /<meta[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?[^>]*http-equiv=["']?refresh["']?/i,
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*URL=([^"'>]+)["']?/i,
          ]

          for (const pattern of metaRefreshPatterns) {
            const match = html.match(pattern)
            if (match && match[1]) {
              const redirectUrl = match[1].trim()
              currentUrl = new URL(redirectUrl, currentUrl).href
              redirectCount++
              continue
            }
          }

          // Check for JavaScript redirects
          const jsRedirectPatterns = [
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
            /location\.replace\(["']([^"']+)["']\)/i,
            /window\.location\.replace\(["']([^"']+)["']\)/i,
          ]

          for (const pattern of jsRedirectPatterns) {
            const match = html.match(pattern)
            if (match && match[1]) {
              currentUrl = new URL(match[1], currentUrl).href
              redirectCount++
              continue
            }
          }

          return currentUrl
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
              })
            } catch (getFetchError: any) {
              // Check if this is an SSL/timeout error - if so, retry with custom fetch
              const isSSLError =
                getFetchError.message?.includes("certificate") ||
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
              ? Array.isArray(getResponse.headers.location)
                ? getResponse.headers.location[0]
                : getResponse.headers.location
              : getResponse.headers.get("location")
            if (location) {
              currentUrl = new URL(location, currentUrl).toString()
              redirectCount++
              continue
            }
          }

          const html = usedCustomFetchForGet ? getResponse.body || "" : await getResponse.text()

          // Check for meta refresh redirects
          const metaRefreshPatterns = [
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?/i,
            /<meta[^>]*content=["']?\d+(?:\.\d+)?;\s*url=([^"'>]+)["']?[^>]*http-equiv=["']?refresh["']?/i,
            /<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?\d+(?:\.\d+)?;\s*URL=([^"'>]+)["']?/i,
          ]

          for (const pattern of metaRefreshPatterns) {
            const match = html.match(pattern)
            if (match && match[1]) {
              const redirectUrl = match[1].trim()
              currentUrl = new URL(redirectUrl, currentUrl).href
              redirectCount++
              continue
            }
          }

          // Check for JavaScript redirects
          const jsRedirectPatterns = [
            /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
            /location\.href\s*=\s*["']([^"']+)["']/i,
            /location\.replace\(["']([^"']+)["']\)/i,
            /window\.location\.replace\(["']([^"']+)["']\)/i,
          ]

          for (const pattern of jsRedirectPatterns) {
            const match = html.match(pattern)
            if (match && match[1]) {
              currentUrl = new URL(match[1], currentUrl).href
              redirectCount++
              continue
            }
          }

          return currentUrl
        } else {
          // Other status code - return current URL
          return currentUrl
        }
      } catch (error) {
        return currentUrl
      }
    }

    return currentUrl
  } catch (error) {
    return url
  }
}

/**
 * Strip query parameters from URL to protect privacy
 * Removes everything after the ? in the URL
 */
export function stripQueryParams(url: string): string {
  try {
    const urlObj = new URL(url)
    // Return URL without search params (query string)
    return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`
  } catch (error) {
    // If URL parsing fails, try simple string manipulation
    const questionMarkIndex = url.indexOf("?")
    if (questionMarkIndex !== -1) {
      return url.substring(0, questionMarkIndex)
    }
    return url
  }
}

/**
 * Sanitize URL by removing tracking/seed email parameters while preserving functional parameters
 * This is more selective than removing ALL query parameters
 */
function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)

    // Parameters that should be removed (tracking and seed email exposure)
    const paramsToRemove = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "ref",
      "source",
      "refcode",
      "refid",
      // Add specific parameters that contain seed emails
      "email",
      "e",
      "recipient",
      "subscriber",
    ]

    // Check for seed email in query parameters
    const searchParams = new URLSearchParams(urlObj.search)
    const paramEntries = Array.from(searchParams.entries())

    // Remove tracking parameters
    paramsToRemove.forEach((param) => searchParams.delete(param))

    // Check remaining parameters for email addresses and remove them
    for (const [key, value] of Array.from(searchParams.entries())) {
      if (value.includes("@") || value.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
        searchParams.delete(key)
      }
    }

    urlObj.search = searchParams.toString()
    return urlObj.toString()
  } catch (error) {
    // If URL parsing fails, return as-is (don't break the link)
    return url
  }
}

/**
 * Normalize URL for caching (remove tracking parameters, lowercase)
 */
function normalizeUrlForCache(url: string): string {
  try {
    const urlObj = new URL(url)
    // Remove common tracking parameters
    const trackingParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "source"]
    trackingParams.forEach((param) => urlObj.searchParams.delete(param))
    return urlObj.toString().toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/**
 * Categorize CTAs using AI with caching
 */
async function categorizeCtasWithAI(
  ctas: Array<{ url: string; finalUrl?: string; text?: string }>,
): Promise<Array<{ url: string; finalUrl?: string; type: string; confidence?: number }>> {
  const results: Array<{ url: string; finalUrl?: string; type: string; confidence?: number }> = []
  const uncachedCtas: Array<{ url: string; finalUrl?: string; text?: string; normalizedUrl: string }> = []

  // Check cache for each CTA
  for (const cta of ctas) {
    const urlToCheck = cta.finalUrl || cta.url
    const normalizedUrl = normalizeUrlForCache(urlToCheck)
    const cached = await prisma.ctaCategory.findUnique({
      where: { url: normalizedUrl },
    })

    if (cached) {
      results.push({
        url: cta.url,
        finalUrl: cta.finalUrl,
        type: cached.category,
        confidence: cached.confidence || undefined,
      })
    } else {
      uncachedCtas.push({ ...cta, normalizedUrl })
    }
  }

  // If all CTAs were cached, return early
  if (uncachedCtas.length === 0) {
    return results
  }

  const stillUncategorized: Array<{ url: string; finalUrl?: string; text?: string; normalizedUrl: string }> = []

  for (const cta of uncachedCtas) {
    const urlToCheck = cta.finalUrl || cta.url
    const patternType = categorizeCTA(urlToCheck)

    // If pattern matching gives us a confident answer (not "other"), use it
    if (patternType !== "other") {
      // Cache the result
      await prisma.ctaCategory.upsert({
        where: { url: cta.normalizedUrl },
        update: {
          category: patternType,
          confidence: 0.9,
        },
        create: {
          url: cta.normalizedUrl,
          category: patternType,
          confidence: 0.9, // High confidence for pattern matching
        },
      })

      results.push({
        url: cta.url,
        finalUrl: cta.finalUrl,
        type: patternType,
      })
    } else {
      stillUncategorized.push(cta)
    }
  }

  // If all CTAs were categorized by patterns, return early
  if (stillUncategorized.length === 0) {
    return results
  }

  try {
    const prompt = `You are analyzing political campaign email CTAs. Categorize each URL as: donation, petition, event, volunteer, or other.

**Category Definitions:**
- donation: ANY fundraising, contribution, or payment page. This includes ALL donation platforms and payment processors.
- petition: Sign-on campaigns, advocacy actions, "add your name" pages
- event: Rally registrations, town halls, RSVP pages, virtual events
- volunteer: Volunteer signups, canvassing, phone banking, "get involved" pages
- other: Social media, news articles, website homepages, email preferences

**CRITICAL - Donation Platform Recognition:**
These domains are ALWAYS donations (even if the URL looks generic):
- ActBlue (actblue.com, secure.actblue.com) → donation
- WinRed (winred.com, secure.winred.com) → donation
- Anedot (anedot.com, secure.anedot.com) → donation
- NGP VAN (ngpvan.com) → donation
- RevV (revv.co) → donation
- Any URL with "secure.", "donate.", "contribute.", "give." subdomains → donation
- Any URL path containing: /donate, /contribute, /give, /chip-in, /support, /go/, /a/ → donation

**Petition Platforms:**
- Change.org, MoveOn, ActionNetwork → petition

**Event Platforms:**
- Eventbrite, Mobilize → event

**Volunteer Platforms:**
- Mobilize, VolunteerLocal → volunteer

**Important Rules:**
1. If a URL redirects to a donation platform (WinRed, ActBlue, etc.), it's a donation
2. Generic tracking URLs that end up on donation platforms are donations
3. URLs with donation keywords (donate, contribute, chip-in, give, support, fund) are donations
4. When in doubt between donation and other, choose donation if there's any fundraising indicator

**CTAs to categorize:**
${stillUncategorized.map((cta, i) => `${i + 1}. URL: ${cta.finalUrl || cta.url}${cta.text ? `\n   Link text: "${cta.text}"` : ""}`).join("\n\n")}

**Instructions:** Respond with ONLY the category for each URL (one per line): donation, petition, event, volunteer, or other

Example response format:
donation
petition
  other`
  
  const { text } = await generateText({
    model: "openai/gpt-4o-mini",
    prompt,
    temperature: 0.1,
  })

    // Parse AI response
    const categories = text
      .trim()
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter((line) => ["donation", "petition", "event", "volunteer", "other"].includes(line))

    // Match categories to CTAs and cache results
    for (let i = 0; i < stillUncategorized.length; i++) {
      const cta = stillUncategorized[i]
      const category = categories[i] || "other"

      // Cache the result
      await prisma.ctaCategory.upsert({
        where: { url: cta.normalizedUrl },
        update: {
          category,
          confidence: 0.85,
        },
        create: {
          url: cta.normalizedUrl,
          category,
          confidence: 0.85,
        },
      })

      results.push({
        url: cta.url,
        finalUrl: cta.finalUrl,
        type: category,
      })
    }
  } catch (error) {
    console.error("Error categorizing CTAs with AI:", error)

    // Fallback to pattern matching for uncached CTAs
    for (const cta of stillUncategorized) {
      const urlToCheck = cta.finalUrl || cta.url
      const type = categorizeCTA(urlToCheck)
      results.push({ url: cta.url, finalUrl: cta.finalUrl, type })
    }
  }

  return results
}

/**
 * Check if a URL contains any of the provided email addresses
 */
function containsEmailAddress(url: string, emails: string[]): boolean {
  const lowerUrl = url.toLowerCase()
  return emails.some((email) => lowerUrl.includes(email.toLowerCase()))
}

/**
 * Use AI to detect unsubscribe links that don't match common patterns
 * Returns a Set of URLs that are identified as unsubscribe links
 */
async function detectUnsubscribeLinksWithAI(links: Array<{ url: string; text?: string }>): Promise<Set<string>> {
  if (links.length === 0) {
    return new Set()
  }

  try {
    const prompt = `You are analyzing links from political campaign emails. Identify which links are unsubscribe, opt-out, or email preference management links.

**What counts as unsubscribe/opt-out:**
- Links to unsubscribe from email lists
- Links to manage email preferences or subscriptions
- Links to opt-out of communications
- Links to remove yourself from mailing lists
- Links to update email settings
- Links to stop receiving emails

**What does NOT count:**
- Donation links
- Petition links
- Event registration links
- Social media links
- News articles
- Campaign website homepages

**Links to analyze:**
${links.map((link, i) => `${i + 1}. URL: ${link.url}${link.text ? `\n   Link text: "${link.text}"` : ""}`).join("\n\n")}

**Instructions:** Respond with ONLY the numbers of links that are unsubscribe/opt-out links (comma-separated). If none are unsubscribe links, respond with "none".
  
  Example response: "1, 3, 5" or "none"`
  
  const { text } = await generateText({
    model: "openai/gpt-4o-mini",
    prompt,
    temperature: 0.1,
  })

    // Parse AI response
    const response = text.trim().toLowerCase()
    if (response === "none") {
      return new Set()
    }

    // Extract numbers from response
    const numbers = response
      .split(",")
      .map((n) => Number.parseInt(n.trim()))
      .filter((n) => !isNaN(n) && n > 0 && n <= links.length)

    // Convert numbers to URLs
    const unsubscribeUrls = new Set<string>()
    numbers.forEach((num) => {
      const link = links[num - 1]
      if (link) {
        unsubscribeUrls.add(link.url)
      }
    })

    return unsubscribeUrls
  } catch (error) {
    return new Set()
  }
}

/**
 * Extract CTA links from email HTML content with AI categorization
 * Filters out social media footer links, fonts, tracking, and other non-CTA links
 * Resolves redirect chains to show final destination URLs
 */
export async function extractCTALinks(
  htmlContent: string,
  seedEmails: string[] = [],
): Promise<Array<{ url: string; finalUrl?: string; originalUrl?: string; type: string }>> {
  const links: Array<{ url: string; text?: string; context?: string }> = []
  const seenUrls = new Map<string, boolean>()

  const $ = cheerio.load(htmlContent)

  const unsubscribePatterns = [
    /unsubscribe/i,
    /un-subscribe/i,
    /opt.*out/i,
    /opt-out/i,
    /optout/i,
    /preferences/i,
    /manage.*subscription/i,
    /subscription.*manage/i,
    /remove.*list/i,
    /remove.*email/i,
    /stop.*email/i,
    /cancel.*subscription/i,
    /email.*settings/i,
    /email.*preferences/i,
    /update.*preferences/i,
    /list.*unsubscribe/i,
    /list-unsubscribe/i,
    /mailto:/i,
  ]

  const unsubscribeServiceDomains = [
    "nucleusemail.com",
    "unsubscribe",
    "optout",
    "preferences",
    "subscriptions",
    "email-preferences",
    "manage-subscription",
    "list-manage",
    "mailchimp.com/unsubscribe",
    "constantcontact.com/unsubscribe",
    "sendgrid.net/unsubscribe",
    "mailgun.com/unsubscribe",
  ]

  const subscriptionContextPatterns = [
    /change.*subscription/i,
    /manage.*subscription/i,
    /subscription.*status/i,
    /email.*preferences/i,
    /update.*preferences/i,
    /communication.*preferences/i,
    /stop.*receiving/i,
    /no longer.*receive/i,
    /remove.*from.*list/i,
    /to unsubscribe/i,
    /unsubscribe from/i,
  ]

  const excludePatterns = [
    // Social media (unless specific post URLs)
    /^https?:\/\/(www\.)?(facebook|twitter|instagram|linkedin|youtube|tiktok)\.com\/?$/i,
    /^https?:\/\/(www\.)?fb\.com\/?$/i,
    /^https?:\/\/(www\.)?x\.com\/?$/i,

    // Fonts and assets
    /fonts\.googleapis\.com/i,
    /fonts\.gstatic\.com/i,
    /googlefonts/i,

    // Tracking and analytics
    /analytics/i,
    /tracking/i,
    /pixel/i,
    /beacon/i,

    // Email client links
    /view.*browser/i,
    /email.*client/i,
  ]

  // CTA keywords that indicate important links
  const ctaKeywords = [
    /donate/i,
    /contribute/i,
    /chip.*in/i,
    /support/i,
    /sign/i,
    /join/i,
    /act/i,
    /petition/i,
    /volunteer/i,
    /event/i,
    /rsvp/i,
  ]

  $("a").each((_, element) => {
    const $link = $(element)
    const url = $link.attr("href") || ""
    const linkText = $link.text().trim()

    // Skip non-http links
    if (!url.startsWith("http")) {
      return
    }

    // Skip if matches any exclude pattern
    if (excludePatterns.some((pattern) => pattern.test(url))) {
      return
    }

    if (unsubscribePatterns.some((pattern) => pattern.test(url))) {
      return
    }

    if (unsubscribePatterns.some((pattern) => pattern.test(linkText))) {
      return
    }

    const lowerUrl = url.toLowerCase()
    if (unsubscribeServiceDomains.some((domain) => lowerUrl.includes(domain))) {
      return
    }

    let contextText = ""
    const $parent = $link.parent()
    if ($parent.length) {
      contextText = $parent.text().toLowerCase()
    }

    const hasSubscriptionContext = subscriptionContextPatterns.some((pattern) => pattern.test(contextText))

    const hasGenericLinkText = /^(this link|here|click here|link|update)$/i.test(linkText)

    if (hasGenericLinkText && hasSubscriptionContext) {
      return
    }

    // Skip if contains seed email
    if (containsEmailAddress(url, seedEmails)) {
      return
    }

    const sanitizedUrl = sanitizeUrl(url)

    if (containsEmailAddress(sanitizedUrl, seedEmails)) {
      return
    }

    // Check if URL contains CTA keywords (prioritize these)
    const hasCTAKeyword = ctaKeywords.some((keyword) => keyword.test(sanitizedUrl) || keyword.test(linkText || ""))

    if (hasCTAKeyword || links.length < 20) {
      // Increased from 10 to 20 to catch more links initially
      links.push({ url: sanitizedUrl, text: linkText, context: contextText })
    }
  })

  // Remove duplicates by URL
  const uniqueLinks = Array.from(new Map(links.map((link) => [link.url, link])).values())

  const aiDetectedUnsubscribeUrls = await detectUnsubscribeLinksWithAI(uniqueLinks)

  const filteredLinks = uniqueLinks.filter((link) => {
    if (aiDetectedUnsubscribeUrls.has(link.url)) {
      return false
    }
    return true
  })

  // Prioritize links with CTA keywords
  const ctaLinks = filteredLinks.filter((link) =>
    ctaKeywords.some((keyword) => keyword.test(link.url) || keyword.test(link.text || "")),
  )
  const otherLinks = filteredLinks.filter(
    (link) => !ctaKeywords.some((keyword) => keyword.test(link.url) || keyword.test(link.text || "")),
  )

  const topLinks = [...ctaLinks, ...otherLinks].slice(0, 15)

  const linksWithFinalUrls = await Promise.all(
    topLinks.map(async (link) => {
      // Enhanced tracking link detection
      const isTrkLink = 
        link.url.includes(".trk.") || 
        link.url.includes("/trk.") ||
        /trk\./.test(link.url) ||
        link.url.includes("tracking") ||
        link.url.includes("click.") ||
        link.url.includes("redirect.") ||
        link.url.includes("links.")
      
      console.log("[v0] Link processing:", {
        url: link.url.substring(0, 100),
        isTrkLink,
        includes_trk_dot: link.url.includes(".trk."),
        includes_slash_trk: link.url.includes("/trk."),
        regex_match: /trk\./.test(link.url),
      })
      
      let finalUrl = ""
      let cleanedUrl = ""
      let cleanedFinalUrl = ""
      let isDifferent = false

      if (isTrkLink) {
        console.log("[v0] Resolving tracking link:", link.url.substring(0, 100))
        
        // Resolve redirects
        finalUrl = await resolveRedirects(link.url)
        
        console.log("[v0] Resolved to:", finalUrl.substring(0, 100))

        // Strip query params to protect privacy
        cleanedUrl = stripQueryParams(link.url)
        cleanedFinalUrl = stripQueryParams(finalUrl)

        // Only save finalUrl if it's different from the original URL
        isDifferent = cleanedUrl.toLowerCase() !== cleanedFinalUrl.toLowerCase()
        
        console.log("[v0] After stripping params:", {
          cleanedUrl: cleanedUrl.substring(0, 100),
          cleanedFinalUrl: cleanedFinalUrl.substring(0, 100),
          isDifferent,
        })

        // Check if this URL has already been seen (either as original or final URL)
        const existingLink = seenUrls.get(cleanedUrl) || seenUrls.get(cleanedFinalUrl)
        if (existingLink) {
          return {
            url: cleanedUrl, // Use cleaned URL instead of original
            finalUrl: undefined,
            text: link.text,
          }
        }
        seenUrls.set(cleanedUrl, true)
        seenUrls.set(cleanedFinalUrl, true)
      }

      return {
        url: cleanedUrl || link.url, // Use cleaned URL instead of original
        finalUrl: isDifferent ? cleanedFinalUrl : undefined,
        text: link.text,
      }
    }),
  )

  const categorizedLinks = await categorizeCtasWithAI(linksWithFinalUrls)

  return categorizedLinks
}

/**
 * Sanitize email HTML content by removing unsubscribe links and email footers
 * Uses cheerio for reliable HTML parsing and link removal
 */
export function sanitizeEmailContent(htmlContent: string, seedEmails: string[] = []): string {
  if (!htmlContent) return htmlContent

  const $ = cheerio.load(htmlContent)

  // Unsubscribe patterns for text detection
  const unsubscribePatterns = [
    /unsubscribe/i,
    /un-subscribe/i,
    /opt.*out/i,
    /opt-out/i,
    /optout/i,
    /preferences/i,
    /manage.*subscription/i,
    /subscription.*manage/i,
    /remove.*list/i,
    /remove.*email/i,
    /stop.*email/i,
    /cancel.*subscription/i,
    /email.*settings/i,
    /email.*preferences/i,
    /update.*preferences/i,
    /list.*unsubscribe/i,
    /list-unsubscribe/i,
  ]

  const unsubscribeServiceDomains = [
    "nucleusemail.com",
    "unsubscribe",
    "optout",
    "preferences",
    "subscriptions",
    "email-preferences",
    "manage-subscription",
    "list-manage",
    "mailchimp.com/unsubscribe",
    "constantcontact.com/unsubscribe",
    "sendgrid.net/unsubscribe",
    "mailgun.com/unsubscribe",
  ]

  const subscriptionContextPatterns = [
    /change.*subscription/i,
    /manage.*subscription/i,
    /subscription.*status/i,
    /email.*preferences/i,
    /update.*preferences/i,
    /communication.*preferences/i,
    /stop.*receiving/i,
    /no longer.*receive/i,
    /remove.*from.*list/i,
    /to unsubscribe/i,
    /unsubscribe from/i,
  ]

  const unsubscribeElements: cheerio.Cheerio<cheerio.Element>[] = []

  $("a").each((_, element) => {
    const $link = $(element)
    const href = $link.attr("href") || ""
    const linkText = $link.text().trim()
    const lowerUrl = href.toLowerCase()

    // Check if URL contains seed email
    if (containsEmailAddress(href, seedEmails)) {
      unsubscribeElements.push($link)
      return
    }

    const containsUnsubscribeDomain = unsubscribeServiceDomains.some((domain) => lowerUrl.includes(domain))

    // Check if URL matches any unsubscribe pattern
    const isUnsubscribeLink = unsubscribePatterns.some((pattern) => pattern.test(href))

    // Check link text for unsubscribe keywords
    const hasUnsubscribeText = unsubscribePatterns.some((pattern) => pattern.test(linkText))

    // Get surrounding context (parent and previous siblings)
    let contextText = ""
    const $parent = $link.parent()
    if ($parent.length) {
      contextText = $parent.text().toLowerCase()
    }

    const hasSubscriptionContext = subscriptionContextPatterns.some((pattern) => pattern.test(contextText))

    const hasGenericLinkText = /^(this link|here|click here|link|update)$/i.test(linkText)

    const isContextualUnsubscribe = hasGenericLinkText && hasSubscriptionContext

    // Mark for removal if it matches any unsubscribe criteria
    if (isUnsubscribeLink || hasUnsubscribeText || containsUnsubscribeDomain || isContextualUnsubscribe) {
      unsubscribeElements.push($link)
    }
  })

  unsubscribeElements.forEach(($link) => {
    $link.remove()
  })

  // Remove email addresses from text nodes
  $("*")
    .contents()
    .filter(function () {
      return this.type === "text"
    })
    .each((_, node) => {
      if (node.type === "text" && node.data) {
        // Replace any email address with [email removed]
        node.data = node.data.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, "[email removed]")
      }
    })

  // Remove mailto: links entirely
  $('a[href^="mailto:"]').remove()

  // Get the modified HTML
  let sanitized = $.html()

  const footerTextPatterns = [
    /You are receiving this email at\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /You received this email because[^.]*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^.]*\./gi,
    /This email was sent to\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /Sent to\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /This message was sent to\s*[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /If you'?d? like to change your subscription[^.]*\./gi,
    /To change your subscription[^.]*\./gi,
    /Manage your subscription[^.]*\./gi,
    /To unsubscribe from[^.]*\./gi,
  ]

  footerTextPatterns.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, "")
  })

  // This regex looks for tracking URLs that are NOT inside href="" attributes
  // We do this by removing them only when they appear after > (closing tag) and before < (opening tag)
  const plainTextTrackingPattern =
    />([^<]*)\b(emails?|track|click|open|pixel)\.[a-z0-9-]+\.[a-z]{2,}\/[a-z0-9/]+\/[a-zA-Z0-9+/=_-]{50,}[^<\s]*([^<]*)</gi
  sanitized = sanitized.replace(plainTextTrackingPattern, ">$1$3<")

  const plainTextBase64Pattern = />([^<]*)\b[a-zA-Z0-9+/=_-]{100,}\b([^<]*)</g
  sanitized = sanitized.replace(plainTextBase64Pattern, ">$1$2<")

  // Clean up empty paragraphs and divs
  sanitized = sanitized.replace(/<(p|div)[^>]*>\s*<\/(p|div)>/gi, "")
  sanitized = sanitized.replace(/<(p|div)[^>]*>&nbsp;<\/(p|div)>/gi, "")

  return sanitized
}

/**
 * Categorize a CTA link based on URL patterns and known platforms (fallback method)
 */
function categorizeCTA(url: string): "donation" | "petition" | "event" | "volunteer" | "other" {
  const lowerUrl = url.toLowerCase()

  // Extract domain for platform detection
  let domain = ""
  try {
    const urlObj = new URL(url)
    domain = urlObj.hostname.toLowerCase()
  } catch {
    // If URL parsing fails, just use the string
    domain = lowerUrl
  }

  // === DONATION PLATFORMS ===
  const donationPlatforms = [
    "actblue.com",
    "secure.actblue.com",
    "winred.com",
    "secure.winred.com",
    "anedot.com",
    "secure.anedot.com",
    "ngpvan.com",
    "revv.co",
    "classy.org",
    "givebutter.com",
    "donorbox.org",
    "paypal.com",
    "gofundme.com",
    "fundly.com",
    "electjon.com",
    "act.electjon.com",
    "secure.electjon.com",
    "donately.com",
    "qgiv.com",
    "networkforgood.org",
    "justgiving.com",
    "crowdpac.com",
    "fundrazr.com",
    "mightycause.com",
    "rallyup.com",
    "kindful.com",
    "givelively.org",
    "secure.",
    "donate.",
    "contribute.",
    "give.",
    "support.",
  ]

  if (donationPlatforms.some((platform) => domain.includes(platform))) {
    return "donation"
  }

  // === PETITION PLATFORMS ===
  const petitionPlatforms = [
    "change.org",
    "moveon.org",
    "act.moveon.org",
    "actionnetwork.org",
    "action.aclu.org",
    "petitions.whitehouse.gov",
    "causes.com",
    "ipetitions.com",
    "thepetitionsite.com",
  ]

  if (petitionPlatforms.some((platform) => domain.includes(platform))) {
    return "petition"
  }

  // === EVENT PLATFORMS ===
  const eventPlatforms = [
    "eventbrite.com",
    "mobilize.us",
    "mobilize.io",
    "events.ngpvan.com",
    "zoom.us",
    "meet.google.com",
    "teams.microsoft.com",
  ]

  if (eventPlatforms.some((platform) => domain.includes(platform))) {
    return "event"
  }

  // === VOLUNTEER PLATFORMS ===
  const volunteerPlatforms = [
    "mobilize.us",
    "mobilize.io",
    "volunteerlocal.com",
    "signupgenius.com",
    "volunteermatch.org",
  ]

  if (volunteerPlatforms.some((platform) => domain.includes(platform))) {
    return "volunteer"
  }

  // === KEYWORD-BASED DETECTION ===
  // Check URL path and query parameters for keywords

  // Donation keywords
  const donationKeywords = [
    "donate",
    "donation",
    "contribute",
    "contribution",
    "give",
    "giving",
    "chip-in",
    "chipin",
    "chip_in",
    "support",
    "fund",
    "payment",
    "/go/",
    "/a/",
    "pitch-in",
    "pitchin",
    "pitch_in",
    "rush",
    "urgent-donation",
    "emergency-fund",
    "triple-match",
    "double-match",
    "match",
    "goal",
    "deadline",
    "end-of-month",
    "end-of-quarter",
    "fundrais",
  ]

  if (donationKeywords.some((keyword) => lowerUrl.includes(keyword))) {
    return "donation"
  }

  // Petition keywords
  const petitionKeywords = ["petition", "sign", "take-action", "takeaction", "add-your-name", "speak-out"]

  if (petitionKeywords.some((keyword) => lowerUrl.includes(keyword))) {
    return "petition"
  }

  // Event keywords
  const eventKeywords = ["event", "rsvp", "register", "attend", "join-us", "rally", "town-hall", "townhall"]

  if (eventKeywords.some((keyword) => lowerUrl.includes(keyword))) {
    return "event"
  }

  // Volunteer keywords
  const volunteerKeywords = ["volunteer", "get-involved", "join-team", "help-us", "canvass", "phone-bank", "phonebank"]

  if (volunteerKeywords.some((keyword) => lowerUrl.includes(keyword))) {
    return "volunteer"
  }

  // If no match found, return "other"
  return "other"
}

/**
 * Process competitive insights for detected campaigns
 */
export async function processCompetitiveInsights(
  senderEmail: string,
  senderName: string,
  subject: string,
  dateReceived: Date,
  results: Array<{
    seedEmail: string
    placement: "inbox" | "spam" | "not_found"
  }>,
  emailContent?: string,
  entityAssignment?: { entityId: string; assignmentMethod: string } | string | null,
  clientId?: string | null,
): Promise<void> {
  try {
    const sanitizedSubject = sanitizeSubject(subject)

    const senderDomain = senderEmail.split("@")[1]?.toLowerCase()
    if (!senderDomain) {
      return
    }

    const isBlocked = await isDomainBlocked(senderDomain)
    if (isBlocked) {
      return
    }

    const ripClient = await prisma.client.findFirst({
      where: {
        OR: [{ slug: "rip" }, { name: { contains: "RIP", mode: "insensitive" } }],
      },
      select: { id: true },
    })

    if (!ripClient) {
      return
    }

    const ripSeedEmails = await prisma.seedEmail.findMany({
      where: {
        locked: true,
        active: true,
        assignedToClient: ripClient.id,
      },
      select: { email: true },
    })

    const ripEmailAddresses = new Set(ripSeedEmails.map((se) => se.email))

    const ripResults = results.filter((r) => ripEmailAddresses.has(r.seedEmail))

    if (ripResults.length === 0) {
      return
    }

    const inboxCount = ripResults.filter((r) => r.placement === "inbox").length
    const spamCount = ripResults.filter((r) => r.placement === "spam").length
    const notDeliveredCount = ripResults.filter((r) => r.placement === "not_found").length
    const totalCount = ripResults.length
    const inboxRate = totalCount > 0 ? (inboxCount / totalCount) * 100 : 0

    const seedEmailsList = Array.from(ripEmailAddresses)
    const ctaLinks = emailContent ? await extractCTALinks(emailContent, seedEmailsList) : []

    const tags = autoGenerateTags(senderEmail, senderName, sanitizedSubject, emailContent)

    const sanitizedEmailContent = emailContent ? sanitizeEmailContent(emailContent, seedEmailsList) : undefined

    let emailPreview = ""
    if (sanitizedEmailContent) {
      let textContent = sanitizedEmailContent.replace(/<[^>]*>/g, " ")
      textContent = textContent.replace(/\s+/g, " ").trim()
      emailPreview = textContent.substring(0, 300)
      if (textContent.length > 300) {
        emailPreview += "..."
      }
    }

    let entityId: string | null = null
    let assignmentMethod: string | null = null

    if (entityAssignment) {
      if (typeof entityAssignment === "string") {
        // Old format - just entity ID
        entityId = entityAssignment
        assignmentMethod = null
      } else {
        // New format - object with entityId and assignmentMethod
        entityId = entityAssignment.entityId
        assignmentMethod = entityAssignment.assignmentMethod
      }
    }

    const existing = await prisma.competitiveInsightCampaign.findFirst({
      where: {
        senderEmail: senderEmail,
        subject: sanitizedSubject,
      },
    })

    if (existing) {
      await prisma.competitiveInsightCampaign.update({
        where: { id: existing.id },
        data: {
          inboxCount: existing.inboxCount + inboxCount,
          spamCount: existing.spamCount + spamCount,
          notDeliveredCount: existing.notDeliveredCount + notDeliveredCount,
          inboxRate:
            ((existing.inboxCount + inboxCount) /
              (existing.inboxCount + existing.spamCount + existing.notDeliveredCount + totalCount)) *
            100,
          ctaLinks: ctaLinks.length > 0 ? JSON.stringify(ctaLinks) : existing.ctaLinks,
          tags: JSON.stringify(tags),
          emailPreview: emailPreview || existing.emailPreview,
          emailContent: sanitizedEmailContent || existing.emailContent,
        },
      })
    } else {
      await prisma.competitiveInsightCampaign.create({
        data: {
          senderEmail,
          senderName,
          subject: sanitizedSubject,
          dateReceived,
          inboxCount,
          spamCount,
          notDeliveredCount,
          inboxRate,
          ctaLinks: ctaLinks.length > 0 ? JSON.stringify(ctaLinks) : null,
          tags: JSON.stringify(tags),
          emailPreview,
          emailContent: sanitizedEmailContent,
          entityId,
          assignmentMethod,
          assignedAt: entityId ? new Date() : null,
          clientId,
          source: clientId ? "personal" : "seed",
        },
      })
    }
  } catch (error) {
    console.error("Error processing competitive insights:", error)
    throw error
  }
}

/**
 * Auto-generate tags based on sender email and patterns
 */
export function autoGenerateTags(
  senderEmail: string,
  senderName: string,
  subject: string,
  emailContent?: string,
): string[] {
  const tags: string[] = []
  const lowerEmail = senderEmail.toLowerCase()
  const lowerName = senderName.toLowerCase()
  const lowerSubject = subject.toLowerCase()
  const lowerContent = emailContent?.toLowerCase() || ""
  const combinedText = `${lowerSubject} ${lowerContent}`

  // === SENDER TYPE ===
  // Check for specific candidates/politicians
  const candidateNames = [
    "trump",
    "biden",
    "harris",
    "desantis",
    "warren",
    "sanders",
    "cruz",
    "rubio",
    "mcconnell",
    "pelosi",
    "schumer",
    "mccarthy",
    "ocasio-cortez",
    "aoc",
  ]
  if (candidateNames.some((name) => lowerEmail.includes(name) || lowerName.includes(name))) {
    tags.push("Candidate")
  }

  // Check for party organizations
  if (
    lowerEmail.includes("dnc") ||
    lowerEmail.includes("rnc") ||
    lowerEmail.includes("dccc") ||
    lowerEmail.includes("nrcc") ||
    lowerEmail.includes("dscc") ||
    lowerEmail.includes("nrsc") ||
    lowerName.includes("democratic party") ||
    lowerName.includes("republican party") ||
    lowerName.includes("democratic national") ||
    lowerName.includes("republican national")
  ) {
    tags.push("Party")
  }

  // Check for PAC indicators
  if (
    lowerEmail.includes("pac") ||
    lowerName.includes("pac") ||
    lowerName.includes("political action") ||
    lowerName.includes("super pac") ||
    lowerName.includes("superpac")
  ) {
    tags.push("PAC")
  }

  // Check for grassroots/advocacy organizations
  if (
    lowerName.includes("grassroots") ||
    lowerName.includes("action") ||
    lowerName.includes("coalition") ||
    lowerName.includes("alliance") ||
    lowerName.includes("network") ||
    combinedText.includes("grassroots") ||
    combinedText.includes("people-powered")
  ) {
    tags.push("Advocacy Group")
  }

  // === MESSAGE TYPE ===
  // Fundraising
  const fundraisingKeywords = [
    "donate",
    "contribution",
    "chip in",
    "give",
    "support us",
    "pitch in",
    "match",
    "triple",
    "double",
    "goal",
    "deadline",
    "raised",
    "donors",
    "contribute",
  ]
  if (fundraisingKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Fundraising")
  }

  // Petition/Advocacy
  const petitionKeywords = ["petition", "sign", "take action", "speak out", "add your name", "stand with"]
  if (petitionKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Petition")
  }

  // Survey/Poll
  if (
    combinedText.includes("survey") ||
    combinedText.includes("poll") ||
    combinedText.includes("questionnaire") ||
    combinedText.includes("your opinion")
  ) {
    tags.push("Survey")
  }

  // Event/Mobilization
  const eventKeywords = [
    "event",
    "rally",
    "town hall",
    "volunteer",
    "canvass",
    "phone bank",
    "join us",
    "rsvp",
    "register",
  ]
  if (eventKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Event")
  }

  // News/Update
  const newsKeywords = ["update", "news", "breaking", "announcement", "just happened", "latest", "report"]
  if (newsKeywords.some((keyword) => combinedText.includes(keyword)) && !tags.includes("Fundraising")) {
    tags.push("News/Update")
  }

  // === CONTENT THEME ===
  // Policy-focused
  const policyKeywords = [
    "policy",
    "legislation",
    "bill",
    "law",
    "reform",
    "plan",
    "proposal",
    "healthcare",
    "climate",
    "education",
    "immigration",
    "economy",
    "jobs",
    "tax",
  ]
  if (policyKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Policy-Focused")
  }

  // Personal story
  const personalKeywords = [
    "my story",
    "i grew up",
    "my family",
    "my experience",
    "when i was",
    "i remember",
    "personal",
  ]
  if (personalKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Personal Story")
  }

  // Attack/Opposition
  const attackKeywords = [
    "opponent",
    "against",
    "stop",
    "fight",
    "defeat",
    "dangerous",
    "threat",
    "extreme",
    "radical",
    "attack",
  ]
  if (attackKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Attack/Opposition")
  }

  // Endorsement
  if (
    combinedText.includes("endorse") ||
    combinedText.includes("support from") ||
    combinedText.includes("backing") ||
    combinedText.includes("endorsed by")
  ) {
    tags.push("Endorsement")
  }

  // === CALL-TO-ACTION ===
  // Donate CTA
  if (
    combinedText.includes("donate now") ||
    combinedText.includes("give now") ||
    combinedText.includes("contribute") ||
    combinedText.includes("chip in")
  ) {
    tags.push("CTA: Donate")
  }

  // Sign CTA
  if (
    combinedText.includes("sign now") ||
    combinedText.includes("add your name") ||
    combinedText.includes("sign the")
  ) {
    tags.push("CTA: Sign")
  }

  // Share CTA
  if (
    combinedText.includes("share") ||
    combinedText.includes("forward") ||
    combinedText.includes("spread the word") ||
    combinedText.includes("tell your friends")
  ) {
    tags.push("CTA: Share")
  }

  // Volunteer CTA
  if (
    combinedText.includes("volunteer") ||
    combinedText.includes("get involved") ||
    combinedText.includes("join our team") ||
    combinedText.includes("help us")
  ) {
    tags.push("CTA: Volunteer")
  }

  // RSVP CTA
  if (combinedText.includes("rsvp") || combinedText.includes("register") || combinedText.includes("save your spot")) {
    tags.push("CTA: RSVP")
  }

  // === TONE ===
  // Urgent/Alarming
  const urgentKeywords = [
    "urgent",
    "emergency",
    "crisis",
    "last chance",
    "final",
    "expires",
    "midnight",
    "hours left",
    "running out",
    "critical",
  ]
  if (urgentKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Urgent Tone")
  }

  // Inspirational
  const inspirationalKeywords = [
    "together",
    "hope",
    "future",
    "believe",
    "dream",
    "inspire",
    "change",
    "movement",
    "historic",
  ]
  if (inspirationalKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Inspirational")
  }

  // Conversational
  const conversationalKeywords = ["hey", "hi there", "quick question", "wanted to reach out", "checking in", "chat"]
  if (conversationalKeywords.some((keyword) => combinedText.includes(keyword))) {
    tags.push("Conversational")
  }

  // Informational (if no strong emotional tone)
  if (
    !tags.includes("Urgent Tone") &&
    !tags.includes("Inspirational") &&
    !tags.includes("Conversational") &&
    (tags.includes("News/Update") || tags.includes("Policy-Focused"))
  ) {
    tags.push("Informational")
  }

  // If still no tags, try to infer from domain
  if (tags.length === 0) {
    const domain = senderEmail.split("@")[1]?.toLowerCase()
    if (domain) {
      if (domain.includes("actblue") || domain.includes("winred")) {
        tags.push("Fundraising Platform")
      } else if (domain.includes("campaign") || domain.includes("elect")) {
        tags.push("Campaign")
      } else {
        tags.push("Political")
      }
    } else {
      tags.push("Political")
    }
  }

  // Remove duplicates and limit to top 4 most relevant tags
  const uniqueTags = [...new Set(tags)]

  // Prioritize tags: Sender Type > Message Type > Content Theme > CTA > Tone
  const priorityOrder = [
    "Candidate",
    "Party",
    "PAC",
    "Advocacy Group",
    "Fundraising",
    "Petition",
    "Survey",
    "Event",
    "News/Update",
    "Policy-Focused",
    "Personal Story",
    "Attack/Opposition",
    "Endorsement",
    "CTA: Donate",
    "CTA: Sign",
    "CTA: Share",
    "CTA: Volunteer",
    "CTA: RSVP",
    "Urgent Tone",
    "Inspirational",
    "Conversational",
    "Informational",
  ]

  const sortedTags = uniqueTags.sort((a, b) => {
    const aIndex = priorityOrder.indexOf(a)
    const bIndex = priorityOrder.indexOf(b)
    if (aIndex === -1) return 1
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  // Return top 4 tags
  return sortedTags.slice(0, 4)
}

/**
 * Check if a domain is blocked
 */
async function isDomainBlocked(emailDomain: string): Promise<boolean> {
  const normalizedDomain = emailDomain.toLowerCase()

  const blockedDomain = await prisma.blockedDomain.findFirst({
    where: {
      domain: {
        equals: normalizedDomain,
        mode: "insensitive",
      },
    },
  })

  return !!blockedDomain
}

export function sanitizeEmailLinks(html: string): string {
  if (!html) return html

  // Replace all href attributes with sanitized versions
  return html.replace(/href=["']([^"']+)["']/gi, (match, url) => {
    try {
      const sanitizedUrl = stripQueryParams(url)
      // Preserve the original quote style
      const quote = match.includes('href="') ? '"' : "'"
      return `href=${quote}${sanitizedUrl}${quote}`
    } catch (error) {
      // If sanitization fails, return original
      return match
    }
  })
}
