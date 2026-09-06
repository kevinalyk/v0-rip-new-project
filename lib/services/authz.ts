import type { MobileAuthContext } from "@/lib/mobile-auth"
import { MobileAuthError } from "@/lib/mobile-auth"
import { hasCompetitiveInsightsAccess, type SubscriptionPlan, type SubscriptionStatus } from "@/lib/subscription-utils"

/**
 * Every mobile route that reads/writes client-scoped data must call this first.
 * Fails closed: no clientId on the context (e.g. a RIP employee without a client
 * association) is treated as "no access" rather than "access to everything".
 */
export function requireClientContext(ctx: MobileAuthContext): { clientId: string; plan: SubscriptionPlan } {
  if (!ctx.clientId || !ctx.client) {
    throw new MobileAuthError(403, "NO_CLIENT_CONTEXT", "This account is not associated with a client")
  }
  return { clientId: ctx.clientId, plan: ctx.client.subscriptionPlan as SubscriptionPlan }
}

/** Client isolation guard: throws 403 if a loaded resource's clientId doesn't match the caller's. */
export function assertClientMatches(ctx: MobileAuthContext, resourceClientId: string | null | undefined): void {
  if (!ctx.clientId || resourceClientId !== ctx.clientId) {
    throw new MobileAuthError(403, "FORBIDDEN", "You do not have access to this resource")
  }
}

/** Ownership guard for user-scoped resources (e.g. campaign alerts). */
export function assertOwnedByUser(ctx: MobileAuthContext, resourceUserId: string | null | undefined): void {
  if (resourceUserId !== ctx.userId) {
    throw new MobileAuthError(403, "FORBIDDEN", "You do not have access to this resource")
  }
}

export function requireCompetitiveInsights(ctx: MobileAuthContext): void {
  const { client } = ctx
  if (!client) {
    throw new MobileAuthError(403, "NO_CLIENT_CONTEXT", "This account is not associated with a client")
  }
  if (!client.hasCompetitiveInsights) {
    throw new MobileAuthError(403, "CI_NOT_ENABLED", "Competitive Insights is not enabled for this client")
  }
  const hasAccess = hasCompetitiveInsightsAccess(
    client.subscriptionPlan as SubscriptionPlan,
    client.subscriptionStatus as SubscriptionStatus,
  )
  if (!hasAccess) {
    throw new MobileAuthError(403, "SUBSCRIPTION_INACTIVE", "Client subscription is not active")
  }
}
