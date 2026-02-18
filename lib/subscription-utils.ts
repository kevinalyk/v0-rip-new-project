export type SubscriptionPlan = "free" | "paid" | "all" | "basic_inboxing" | "enterprise"
export type SubscriptionStatus = "active" | "cancelled" | "past_due"

export interface PlanLimits {
  ciHistoryDays: number | null // null = unlimited
  ciFollowLimit: number | null // null = unlimited
  hasPersonalEmail: boolean
  hasInboxTools: boolean
  seedTestsPerMonth: number | null // null = unlimited
  canAddOwnSeeds: boolean
  emailVolumeLimit: number // Number.POSITIVE_INFINITY = unlimited
}

export interface ClientWithSubscription {
  id: string
  subscriptionStatus: SubscriptionStatus
  subscriptionPlan: SubscriptionPlan
  emailVolumeUsed: number
  emailVolumeLimit: number
}

export const PLAN_LIMITS: Record<SubscriptionPlan, PlanLimits> = {
  free: {
    ciHistoryDays: 1, // Last day only
    ciFollowLimit: 0, // Cannot follow
    hasPersonalEmail: false,
    hasInboxTools: false,
    seedTestsPerMonth: 0,
    canAddOwnSeeds: false,
    emailVolumeLimit: 0,
  },
  paid: {
    ciHistoryDays: 30, // 30 days of history
    ciFollowLimit: 3, // Updated from 1 to 3 entities
    hasPersonalEmail: false,
    hasInboxTools: false,
    seedTestsPerMonth: 0,
    canAddOwnSeeds: false,
    emailVolumeLimit: 20000,
  },
  all: {
    ciHistoryDays: null, // Full history
    ciFollowLimit: null, // Unlimited follows
    hasPersonalEmail: true,
    hasInboxTools: false,
    seedTestsPerMonth: 0,
    canAddOwnSeeds: false,
    emailVolumeLimit: 20000,
  },
  basic_inboxing: {
    ciHistoryDays: null, // Full history
    ciFollowLimit: null, // Unlimited follows
    hasPersonalEmail: true,
    hasInboxTools: true,
    seedTestsPerMonth: 5,
    canAddOwnSeeds: false,
    emailVolumeLimit: 20000,
  },
  enterprise: {
    ciHistoryDays: null, // Full history
    ciFollowLimit: null, // Unlimited follows
    hasPersonalEmail: true,
    hasInboxTools: true,
    seedTestsPerMonth: null, // Unlimited
    canAddOwnSeeds: true,
    emailVolumeLimit: Number.POSITIVE_INFINITY,
  },
}

export const PLAN_PRICES: Record<SubscriptionPlan, number> = {
  free: 0,
  paid: 50,
  all: 300, // Updated from 250 to 300 to match website pricing
  basic_inboxing: 1000,
  enterprise: 0, // Custom pricing
}

export const CI_ADDON_PRICE = 500
export const ADDITIONAL_USER_SEAT_PRICE = 50

export function getPlanLimits(plan: SubscriptionPlan): PlanLimits {
  return PLAN_LIMITS[plan]
}

export function getCIHistoryDays(plan: SubscriptionPlan): number | null {
  return PLAN_LIMITS[plan].ciHistoryDays
}

export function getCIFollowLimit(plan: SubscriptionPlan): number | null {
  return PLAN_LIMITS[plan].ciFollowLimit
}

export function canFollowMoreEntities(plan: SubscriptionPlan, currentFollowCount: number): boolean {
  const limit = PLAN_LIMITS[plan].ciFollowLimit
  if (limit === null) return true // Unlimited
  return currentFollowCount < limit
}

export function hasCompetitiveInsightsAccess(
  plan: SubscriptionPlan,
  subscriptionStatus: SubscriptionStatus = "active",
): boolean {
  // Must have active subscription (or be on free plan)
  if (subscriptionStatus !== "active" && plan !== "free") {
    return false
  }

  // All plans have CI access (free just has limited history)
  return true
}

export function hasInboxToolsAccess(plan: SubscriptionPlan): boolean {
  return PLAN_LIMITS[plan].hasInboxTools
}

export function canClientProcessEmails(client: ClientWithSubscription): boolean {
  // Must have active subscription and be under email volume limit
  return hasActiveSubscription(client) && client.emailVolumeUsed < client.emailVolumeLimit
}

export function getUsagePercentage(emailVolumeUsed: number, emailVolumeLimit: number): number {
  if (emailVolumeLimit === Number.POSITIVE_INFINITY) return 0
  return Math.min(100, (emailVolumeUsed / emailVolumeLimit) * 100)
}

export function formatPlanName(plan: SubscriptionPlan): string {
  const names: Record<SubscriptionPlan, string> = {
    free: "Starter",
    paid: "Basic",
    all: "Professional",
    basic_inboxing: "Advanced",
    enterprise: "Enterprise",
  }
  return names[plan]
}

export function hasActiveSubscription(client: ClientWithSubscription): boolean {
  return client.subscriptionStatus === "active"
}

export function canPerformWrites(client: ClientWithSubscription): boolean {
  return hasActiveSubscription(client)
}

export function getUserSeatsIncluded(plan: SubscriptionPlan): number {
  const userLimits: Record<SubscriptionPlan, number> = {
    free: 1,
    paid: 1,
    all: 3, // Professional: 3 users included
    basic_inboxing: 1,
    enterprise: 999, // Effectively unlimited
  }
  return userLimits[plan]
}

export function getTotalUserLimit(plan: SubscriptionPlan, additionalSeats: number): number {
  const baseSeats = getUserSeatsIncluded(plan)
  return baseSeats + additionalSeats
}

export function canAddMoreUsers(
  plan: SubscriptionPlan,
  currentUserCount: number,
  userSeatsIncluded: number,
  additionalUserSeats: number,
): boolean {
  const totalLimit = userSeatsIncluded + additionalUserSeats
  return currentUserCount < totalLimit
}

export function calculateAdditionalSeatsNeeded(plan: SubscriptionPlan, currentUserCount: number): number {
  const baseSeats = getUserSeatsIncluded(plan)
  if (currentUserCount <= baseSeats) {
    return 0
  }
  return currentUserCount - baseSeats
}
