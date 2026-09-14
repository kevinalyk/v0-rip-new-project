import { FREE_TIER_DELAY_HOURS, PLAN_LIMITS, type SubscriptionPlan } from "@/lib/subscription-utils"

export interface MobileClientEntitlements {
  canSearchAndFilterFeed: boolean
  canUseAlerts: boolean
  feedHistoryHours: number | null
  /** Hours the feed window itself is shifted into the past. 0 means real-time (no delay). */
  feedDelayHours: number
  followedEntityLimit: number | null
}

/**
 * The database column is intentionally a string for backwards compatibility, so
 * mobile authorization must validate it before treating it as a SubscriptionPlan.
 */
export function isSupportedSubscriptionPlan(plan: string): plan is SubscriptionPlan {
  return Object.prototype.hasOwnProperty.call(PLAN_LIMITS, plan)
}

/**
 * Mobile clients receive capabilities, not their own copy of the plan matrix. An
 * unknown value falls back to the most restrictive Starter limits so a bad or newly
 * introduced plan can never accidentally unlock a mobile feature.
 */
export function getMobileClientEntitlements(plan: string): MobileClientEntitlements {
  const resolvedPlan = isSupportedSubscriptionPlan(plan) ? plan : "free"
  const limits = PLAN_LIMITS[resolvedPlan]

  return {
    canSearchAndFilterFeed: limits.canSearchCI,
    canUseAlerts: resolvedPlan !== "free",
    feedHistoryHours: limits.ciHistoryDays === null ? null : limits.ciHistoryDays * 24,
    // Only Starter's feed is delayed today, but this is derived from the plan
    // rather than hardcoded so a future delayed tier doesn't require a mobile change.
    feedDelayHours: resolvedPlan === "free" ? FREE_TIER_DELAY_HOURS : 0,
    followedEntityLimit: limits.ciFollowLimit,
  }
}
