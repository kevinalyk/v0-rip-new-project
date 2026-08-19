import "server-only"
import { headers } from "next/headers"

/**
 * Resolves an origin that works in production, Vercel previews, and the v0
 * preview iframe - used to build OAuth callback / redirect URLs.
 */
export async function getOrigin(): Promise<string> {
  if (process.env.NODE_ENV !== "production" && process.env.V0_RUNTIME_URL) {
    return process.env.V0_RUNTIME_URL
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }
  const h = await headers()
  const host = h.get("x-forwarded-host") ?? h.get("host")
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`
}
