/**
 * Extract and resolve URLs from SMS text messages
 * Unlike email HTML which uses extractCTALinks, this works with plain text
 */

export function extractUrlsFromText(text: string): string[] {
  // Regex to match URLs in text - handles both http/https and shortened links
  const urlRegex =
    /(?:https?:\/\/)?(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi

  const matches = text.match(urlRegex) || []

  // Filter and normalize URLs
  return matches
    .filter((url) => {
      // Skip if it looks like an email address
      if (url.includes("@") && !url.includes("://")) {
        return false
      }
      // Must have a dot (domain)
      return url.includes(".")
    })
    .map((url) => {
      // Add https:// if no protocol
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        return `https://${url}`
      }
      return url
    })
}

/**
 * Strip query parameters from URL to protect privacy
 * Removes everything after the ? in the URL
 */
function stripQueryParams(url: string): string {
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

// Known intermediate redirect domains — if fetch lands here, keep following
const INTERMEDIATE_REDIRECT_DOMAINS = [
  "t.ly",
  "bit.ly",
  "tinyurl.com",
  "ow.ly",
  "buff.ly",
  "dlvr.it",
  "us-gop.co",
  "gop.cm",
  "act.gop.com",
]

function isIntermediateRedirect(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "")
    return INTERMEDIATE_REDIRECT_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

// Try every technique to extract a redirect URL from an HTML body
function extractRedirectFromHtml(html: string, baseUrl: string): string | null {
  const patterns = [
    // JS location redirects
    /window\.location(?:\.href)?\s*=\s*["']([^"']+)["']/i,
    /location\.replace\s*\(\s*["']([^"']+)["']\s*\)/i,
    /location\.href\s*=\s*["']([^"']+)["']/i,
    // Meta refresh
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]+content=["'][^;]+;\s*url=([^"'>\s]+)/i,
    /<meta[^>]+content=["'][^;]+;\s*url=([^"'>\s]+)[^>]+http-equiv=["']?refresh["']?/i,
    // t.ly specific — wraps the real URL in a plain <a> with id="link"
    /<a[^>]+id=["']link["'][^>]+href=["']([^"']+)["']/i,
    // Generic canonical/redirect anchor
    /<a[^>]+href=["'](https?:\/\/[^"']+)["'][^>]*>/i,
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]?.startsWith("http")) {
      return match[1]
    }
  }
  return null
}

/**
 * Resolve a single URL to its final destination, following all hops including
 * JS-redirect intermediaries like t.ly, us-gop.co, etc.
 */
async function resolveToFinal(startUrl: string): Promise<string> {
  const MAX_HOPS = 12
  let currentUrl = startUrl

  for (let hop = 0; hop < MAX_HOPS; hop++) {
    try {
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      })

      const landed = response.url || currentUrl

      // If HTTP redirects already took us somewhere non-intermediate, we're done
      if (landed !== currentUrl && !isIntermediateRedirect(landed)) {
        return landed
      }

      // t.ly uses a client-side API call — hit their API directly
      if (landed.includes("t.ly/")) {
        try {
          const slug = new URL(landed).pathname.replace(/^\//, "")
          if (slug && slug !== "redirect") {
            const apiRes = await fetch(`https://t.ly/api/link?alias=${slug}`, {
              method: "GET",
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Accept: "application/json, text/plain, */*",
                Referer: "https://t.ly/",
              },
            })
            if (apiRes.ok) {
              const json = await apiRes.json()
              const dest = json?.long_url || json?.url || json?.destination
              if (dest && dest.startsWith("http")) {
                currentUrl = dest
                continue
              }
            }
          }
        } catch {}
      }

      // If we're on an intermediate (or haven't moved), fetch the HTML and parse redirect
      const getResponse = await fetch(landed, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
      })

      // HTTP redirect chain from GET may have gone further
      if (getResponse.url && getResponse.url !== landed && !isIntermediateRedirect(getResponse.url)) {
        return getResponse.url
      }

      const html = await getResponse.text()
      const next = extractRedirectFromHtml(html, getResponse.url || landed)

      if (next && next !== currentUrl) {
        currentUrl = next
        continue
      }

      // Nothing more to follow — return wherever we are
      return getResponse.url || landed
    } catch {
      // Network error — return best we have so far
      return currentUrl
    }
  }

  return currentUrl
}

/**
 * Resolve shortened URLs to their final destination
 */
export async function resolveShortenedUrls(urls: string[]): Promise<Array<{ url: string; finalUrl?: string }>> {
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const finalUrl = stripQueryParams(await resolveToFinal(url))
        if (finalUrl !== url) {
          return { url, finalUrl }
        }
        return { url }
      } catch (error: any) {
        const code = error?.cause?.code ?? error?.code ?? ""
        const isCertOrNetworkError = [
          "CERT_HAS_EXPIRED",
          "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
          "ENOTFOUND",
          "ECONNREFUSED",
          "ETIMEDOUT",
        ].includes(code)
        if (isCertOrNetworkError) {
          console.warn(`[SMS Link Extractor] Skipping ${url} (${code})`)
        } else {
          console.error(`[SMS Link Extractor] Error resolving ${url}:`, error)
        }
        return { url }
      }
    }),
  )
  return results
}

/**
 * Extract and resolve CTA links from SMS message text
 * Main entry point for SMS link extraction
 */
export async function extractSmsCtaLinks(
  messageText: string,
): Promise<Array<{ url: string; finalUrl?: string; type: string }>> {
  // Extract URLs from text
  const urls = extractUrlsFromText(messageText)

  if (urls.length === 0) {
    return []
  }

  // Resolve shortened URLs
  const resolvedLinks = await resolveShortenedUrls(urls)

  // Add type categorization (simple for now, can be enhanced with AI later)
  return resolvedLinks.map((link) => ({
    ...link,
    type: categorizeUrl(link.finalUrl || link.url, messageText),
  }))
}

export { extractSmsCtaLinks as extractLinksFromText }

/**
 * Simple URL categorization based on keywords
 * Can be enhanced with AI similar to email CTA categorization
 */
function categorizeUrl(url: string, messageText: string): string {
  const lowerUrl = url.toLowerCase()
  const lowerText = messageText.toLowerCase()

  // Donation keywords
  if (lowerUrl.includes("donate") || lowerUrl.includes("contribute") || lowerUrl.includes("give")) {
    return "donation"
  }

  // Petition keywords
  if (lowerUrl.includes("petition") || lowerUrl.includes("sign") || lowerText.includes("sign the petition")) {
    return "petition"
  }

  // Event keywords
  if (lowerUrl.includes("event") || lowerUrl.includes("rsvp") || lowerText.includes("join us")) {
    return "event"
  }

  // Volunteer keywords
  if (lowerUrl.includes("volunteer") || lowerText.includes("volunteer")) {
    return "volunteer"
  }

  // Default to 'other'
  return "other"
}
