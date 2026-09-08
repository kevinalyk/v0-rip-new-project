import { PLAN_LIMITS, type SubscriptionPlan } from "@/lib/subscription-utils"

export interface MobileClientEntitlements {
  canSearchAndFilterFeed: boolean
  canUseAlerts: boolean
  feedHistoryHours: number | null
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
  const limits = isSupportedSubscriptionPlan(plan) ? PLAN_LIMITS[plan] : PLAN_LIMITS.free

  return {
    canSearchAndFilterFeed: limits.canSearchCI,
    canUseAlerts: isSupportedSubscriptionPlan(plan) && plan !== "free",
    feedHistoryHours: limits.ciHistoryDays === null ? null : limits.ciHistoryDays * 24,
    followedEntityLimit: limits.ciFollowLimit,
  }
}
