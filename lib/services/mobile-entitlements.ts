import { FREE_TIER_DELAY_HOURS, PLAN_LIMITS, type SubscriptionPlan } from "@/lib/subscription-utils"

export interface MobileClientEntitlements {
  canSearchAndFilterFeed: boolean
  canUseAlerts: boolean
  feedHistoryHours: number | null
  /** Hours the feed window itself is shifted into the past. 0 means real-time (no delay). */
  feedDelayHours: number
  followedEntityLimit: number | null
  isAdFree: boolean
  accessSource: "free" | "apple_personal" | "client_plan"
  clientPlanCoversMobile: boolean
  shouldPromptAppleCancellation: boolean
}

export interface MobileSubscriptionState {
  plan: string
  status: string
  expiresAt: Date | null
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
function baseMobileEntitlements(plan: SubscriptionPlan): Omit<MobileClientEntitlements, "accessSource" | "clientPlanCoversMobile" | "shouldPromptAppleCancellation"> {
  // Basic is intentionally a one-seat web plan, but the included mobile account
  // receives the same complete native experience as Professional/Enterprise.
  const mobilePlan = plan === "paid" ? "all" : plan
  const limits = PLAN_LIMITS[mobilePlan]

  return {
    canSearchAndFilterFeed: limits.canSearchCI,
    canUseAlerts: mobilePlan !== "free",
    feedHistoryHours: limits.ciHistoryDays === null ? null : limits.ciHistoryDays * 24,
    feedDelayHours: mobilePlan === "free" ? FREE_TIER_DELAY_HOURS : 0,
    followedEntityLimit: limits.ciFollowLimit,
    isAdFree: mobilePlan !== "free",
  }
}

export function getMobileClientEntitlements(plan: string): MobileClientEntitlements {
  const resolvedPlan = isSupportedSubscriptionPlan(plan) ? plan : "free"
  return {
    ...baseMobileEntitlements(resolvedPlan),
    accessSource: resolvedPlan === "free" ? "free" : "client_plan",
    clientPlanCoversMobile: resolvedPlan !== "free",
    shouldPromptAppleCancellation: false,
  }
}

export function hasActiveApplePersonalSubscription(
  subscription: MobileSubscriptionState,
  now = new Date(),
): boolean {
  if (subscription.plan !== "personal") return false
  if (subscription.status !== "active" && subscription.status !== "grace_period") return false
  return subscription.expiresAt === null || subscription.expiresAt.getTime() > now.getTime()
}

export function getEffectiveMobileEntitlements(
  clientPlan: string,
  clientSubscriptionStatus: string,
  mobileSubscription: MobileSubscriptionState,
  now = new Date(),
): MobileClientEntitlements & { effectivePlan: SubscriptionPlan } {
  const supportedClientPlan = isSupportedSubscriptionPlan(clientPlan) ? clientPlan : "free"
  const clientCovered =
    supportedClientPlan !== "free" &&
    (clientSubscriptionStatus === "active" || clientSubscriptionStatus === "trialing")
  const appleCovered = hasActiveApplePersonalSubscription(mobileSubscription, now)
  const effectivePlan: SubscriptionPlan = clientCovered || appleCovered ? "all" : "free"

  return {
    ...baseMobileEntitlements(effectivePlan),
    effectivePlan,
    accessSource: clientCovered ? "client_plan" : appleCovered ? "apple_personal" : "free",
    clientPlanCoversMobile: clientCovered,
    shouldPromptAppleCancellation: clientCovered && appleCovered,
  }
}
