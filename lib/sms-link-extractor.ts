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

/**
 * Resolve shortened URLs to their final destination
 * Similar to resolveRedirects from competitive-insights-utils
 */
export async function resolveShortenedUrls(urls: string[]): Promise<Array<{ url: string; finalUrl?: string }>> {
  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        // Follow redirects to get final URL
        const response = await fetch(url, {
          method: "HEAD",
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
        })

        const finalUrl = stripQueryParams(response.url)

        // Only include finalUrl if it's different from original
        if (finalUrl !== url) {
          return { url, finalUrl }
        }

        return { url }
      } catch (error) {
        console.error(`[SMS Link Extractor] Error resolving ${url}:`, error)
        // Return original URL if resolution fails
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
