import { encrypt } from "./encryption"

/**
 * Generate a tracked email link that logs clicks before redirecting.
 * Used for tracking engagement with daily digest emails.
 */
export function generateTrackedLink(
  userId: string,
  emailType: "daily_digest" | "weekly_digest",
  linkType:
    | "entity_profile"
    | "campaign"
    | "subscriptions"
    | "settings"
    | "feed"
    | "unsubscribe",
  destination: string,
  baseUrl: string = process.env.APP_URL || "https://app.inbox.gop"
): string {
  // Create encrypted token with click metadata
  const clickData = {
    userId,
    emailType,
    linkType,
  }

  const token = encrypt(JSON.stringify(clickData))

  // Build the tracking URL
  const trackingUrl = new URL(`${baseUrl}/api/track/click`)
  trackingUrl.searchParams.set("token", token)
  trackingUrl.searchParams.set("redirect", destination)

  return trackingUrl.toString()
}
