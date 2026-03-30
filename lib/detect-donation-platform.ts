// Platform detection rules — ORDER MATTERS.
// PSQ must come before WinRed because PSQ emails frequently contain
// WinRed store/merch links that are NOT donation links.
const PLATFORM_RULES: Array<{ platform: string; domains: string[] }> = [
  { platform: "psq",     domains: ["psqimpact.com", "politicalsurveyquestions.com", "psqsurveys.com"] },
  { platform: "actblue", domains: ["actblue.com"] },
  { platform: "anedot",  domains: ["anedot.com"] },
  { platform: "winred",  domains: ["winred.com"] },
]

/**
 * Detect which donation platform an email campaign is for, based on its CTA links.
 * Returns null if no known platform is detected.
 *
 * Uses finalUrl when available (post link-unwrapping), falls back to raw url.
 * PSQ is checked before WinRed to prevent PSQ store/merch WinRed links from
 * being misclassified as WinRed donation campaigns.
 */
export function detectDonationPlatform(ctaLinks: unknown): string | null {
  let links: unknown[] = []

  if (Array.isArray(ctaLinks)) {
    links = ctaLinks
  } else if (typeof ctaLinks === "string") {
    try { links = JSON.parse(ctaLinks) } catch { return null }
  } else {
    return null
  }

  const urls = links.map((link) => {
    if (typeof link === "string") return link.toLowerCase()
    const l = link as Record<string, unknown>
    // Prefer resolved finalUrl, fall back to raw url
    return ((l.finalUrl ?? l.url ?? "") as string).toLowerCase()
  })

  for (const rule of PLATFORM_RULES) {
    if (urls.some((url) => rule.domains.some((d) => url.includes(d)))) {
      return rule.platform
    }
  }

  return null
}
