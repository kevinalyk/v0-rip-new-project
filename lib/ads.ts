import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import prisma from "@/lib/prisma"

/**
 * Returns true if an ad should be shown to the current visitor.
 * Ads are shown to:
 *   - Unauthenticated visitors (not logged in)
 *   - Users whose client is on the free subscription plan
 *
 * Paid users never see ads.
 */
export async function shouldShowAd(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (!token) return true // unauthenticated — show ad

    const payload = await verifyToken(token)
    if (!payload) return true // invalid token — show ad

    const clientSlug = (payload.clientSlug as string) || ""
    if (!clientSlug) return true

    const client = await prisma.client.findFirst({
      where: { slug: clientSlug },
      select: { subscriptionPlan: true },
    })

    if (!client) return true
    return client.subscriptionPlan === "free"
  } catch {
    // On any error, default to showing ad (safe fallback)
    return true
  }
}
