import type { MobileAuthContext } from "@/lib/mobile-auth"
import { MobileAuthError } from "@/lib/mobile-auth"
import {
  getMobileClientEntitlements,
  isSupportedSubscriptionPlan,
} from "@/lib/services/mobile-entitlements"
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
  if (!isSupportedSubscriptionPlan(ctx.client.subscriptionPlan)) {
    throw new MobileAuthError(403, "UNSUPPORTED_SUBSCRIPTION_PLAN", "This account's subscription plan is not supported")
  }
  return { clientId: ctx.clientId, plan: ctx.client.subscriptionPlan }
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

/**
 * Search/filter metadata is a paid CI capability. Feed data access itself remains
 * available to Starter accounts within their plan's three-hour history window.
 */
export function requireFeedSearchAndFilters(
  ctx: MobileAuthContext,
): { clientId: string; plan: SubscriptionPlan } {
  const clientContext = requireClientContext(ctx)
  if (!getMobileClientEntitlements(clientContext.plan).canSearchAndFilterFeed) {
    throw new MobileAuthError(
      403,
      "FEED_FILTERS_NOT_AVAILABLE",
      "Search and filters are not available on your current plan",
    )
  }
  return clientContext
}

/** Mobile CI alerts are available to every active paid plan, with no count limit. */
export function requireMobileAlerts(
  ctx: MobileAuthContext,
): { clientId: string; plan: SubscriptionPlan } {
  requireCompetitiveInsights(ctx)
  const clientContext = requireClientContext(ctx)
  if (!getMobileClientEntitlements(clientContext.plan).canUseAlerts) {
    throw new MobileAuthError(403, "ALERTS_NOT_AVAILABLE", "Push alerts are available on paid plans")
  }
  return clientContext
}
