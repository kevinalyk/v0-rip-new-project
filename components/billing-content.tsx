"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, CreditCard, Calendar, Check, X, AlertTriangle } from "lucide-react"
import { format } from "date-fns"
import { cancelSubscription } from "@/app/actions/stripe"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useParams, useRouter } from "next/navigation"

interface BillingData {
  client: {
    id: string
    name: string
    subscriptionPlan: string
    subscriptionStatus?: string
    hasCompetitiveInsights: boolean
    emailVolumeLimit: number
    emailVolumeUsed: number
    usagePercentage: number
    subscriptionStartDate: string
    subscriptionRenewDate: string | null
    lastUsageReset: string
    stripeSubscriptionId: string | null
    stripeCustomerId: string | null
    cancelAtPeriodEnd?: boolean // Added to track scheduled cancellation
    scheduledDowngradePlan?: string | null // Added scheduledDowngradePlan to interface
  }
  planLimits: {
    emailVolumeLimit: number
    hasAnalytics: boolean
    canAddOwnSeeds: boolean
    canCustomizePersonas: boolean
    competitiveInsightsIncluded: boolean
    supportLevel: string
  }
  userRole: string
}

interface BillingContentProps {
  clientSlug?: string
}

const getPlanFeatures = (plan: string) => {
  switch (plan) {
    case "free":
    case "starter":
      return {
        name: "Starter",
        price: "$0",
        ciHistory: "Last 24 hours",
        followEntities: "None",
        analytics: false,
        inboxTools: false,
        seedTests: false,
        tier: "starter",
        nextTierFeatures: [
          { text: "30 days of campaign history", available: false },
          { text: "Follow up to 3 entities/campaigns", available: false },
        ],
      }
    case "paid":
    case "basic":
      return {
        name: "Basic",
        price: "$50",
        ciHistory: "30 days",
        followEntities: "Up to 3",
        analytics: true,
        inboxTools: false,
        seedTests: false,
        tier: "basic",
        nextTierFeatures: [
          { text: "Full campaign history (unlimited)", available: false },
          { text: "Follow unlimited entities/campaigns", available: false },
        ],
      }
    case "all":
    case "professional":
      return {
        name: "Professional",
        price: "$250",
        ciHistory: "Unlimited",
        followEntities: "Unlimited",
        analytics: true,
        inboxTools: false,
        seedTests: false,
        tier: "professional",
        nextTierFeatures: [
          { text: "Inbox Tools access", available: false },
          { text: "5 seed tests per month", available: false },
        ],
      }
    case "basic_inboxing":
    case "advanced":
      return {
        name: "Advanced",
        price: "$1,000",
        ciHistory: "Unlimited",
        followEntities: "Unlimited",
        analytics: true,
        inboxTools: true,
        seedTests: "5 per month",
        tier: "advanced",
        nextTierFeatures: [
          { text: "Unlimited seed tests", available: false },
          { text: "Custom integrations", available: false },
        ],
      }
    case "enterprise":
      return {
        name: "Enterprise",
        price: "Custom",
        ciHistory: "Unlimited",
        followEntities: "Unlimited",
        analytics: true,
        inboxTools: true,
        seedTests: "Unlimited",
        tier: "enterprise",
        nextTierFeatures: [], // No upgrade available for Enterprise
      }
    default:
      return {
        name: "Unknown",
        price: "$0",
        ciHistory: "Unknown",
        followEntities: "Unknown",
        analytics: false,
        inboxTools: false,
        seedTests: false,
        tier: "unknown",
        nextTierFeatures: [],
      }
  }
}

export function BillingContent({ clientSlug }: BillingContentProps) {
  const [billingData, setBillingData] = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [canceling, setCanceling] = useState(false)
  const [redirectingToPortal, setRedirectingToPortal] = useState(false)
  const params = useParams()
  const router = useRouter()
  const resolvedClientSlug = clientSlug || (params.clientSlug as string)

  useEffect(() => {
    fetchBillingData()
  }, [resolvedClientSlug])

  const fetchBillingData = async () => {
    try {
      setLoading(true)

      const url = `/api/billing?clientSlug=${resolvedClientSlug}`

      const response = await fetch(url, {
        credentials: "include",
      })

      if (response.ok) {
        const data = await response.json()
        setBillingData(data)
      } else {
        const errorText = await response.text()
        console.error("Billing API error:", errorText)
      }
    } catch (error) {
      console.error("Error fetching billing data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelSubscription = async () => {
    if (!billingData?.client.id) return

    try {
      setCanceling(true)
      await cancelSubscription(billingData.client.id, "plan")

      setBillingData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          client: {
            ...prev.client,
            cancelAtPeriodEnd: true,
          },
        }
      })

      setTimeout(() => {
        fetchBillingData()
      }, 1000)
    } catch (error) {
      console.error("Error canceling subscription:", error)
      alert("Failed to cancel subscription. Please try again.")
    } finally {
      setCanceling(false)
    }
  }

  const handleReactivateSubscription = async () => {
    if (!billingData?.client.stripeSubscriptionId) return

    try {
      setCanceling(true)
      const response = await fetch("/api/stripe/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: billingData.client.id,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to reactivate subscription")
      }

      setBillingData((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          client: {
            ...prev.client,
            cancelAtPeriodEnd: false,
          },
        }
      })

      setTimeout(() => {
        fetchBillingData()
      }, 1000)
    } catch (error) {
      console.error("Error reactivating subscription:", error)
      alert("Failed to reactivate subscription. Please try again.")
    } finally {
      setCanceling(false)
    }
  }

  const handleManageSubscription = () => {
    if (resolvedClientSlug) {
      router.push(`/${resolvedClientSlug}/billing`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!billingData) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Failed to load billing information</p>
      </div>
    )
  }

  const { client, planLimits, userRole } = billingData
  const planFeatures = getPlanFeatures(client.subscriptionPlan)

  const canManageBilling = userRole === "owner" || userRole === "admin"
  const isFreeTier = planFeatures.tier === "starter" && !client.stripeSubscriptionId
  const isCancelled = client.subscriptionStatus === "cancelled"
  const hasNoActivePaidPlan = client.subscriptionStatus !== "active" && planFeatures.tier !== "starter"
  const isScheduledForCancellation = client.cancelAtPeriodEnd && client.stripeSubscriptionId
  const isScheduledForDowngrade = client.scheduledDowngradePlan && client.scheduledDowngradePlan !== "free"

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Billing & Usage</h2>
          <p className="text-muted-foreground">Manage your subscription and monitor usage</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Plan
            </CardTitle>
            <CardDescription>Your subscription tier and features</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              {hasNoActivePaidPlan && !isFreeTier ? (
                <>
                  <span className="text-2xl font-bold">No Active Subscription</span>
                  <Badge variant="destructive">Cancelled</Badge>
                </>
              ) : (
                <>
                  <span className="text-2xl font-bold">{planFeatures.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-lg px-3 py-1">
                      {planFeatures.price === "$0" ? "Free" : `${planFeatures.price}/mo`}
                    </Badge>
                    {isScheduledForDowngrade && client.subscriptionRenewDate && (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                        Downgrades {format(new Date(client.subscriptionRenewDate), "MMM d")}
                      </Badge>
                    )}
                    {isScheduledForCancellation && client.subscriptionRenewDate && (
                      <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                        Cancels {format(new Date(client.subscriptionRenewDate), "MMM d")}
                      </Badge>
                    )}
                    {isCancelled && <Badge variant="destructive">Cancelled</Badge>}
                  </div>
                </>
              )}
            </div>

            <div className="space-y-2">
              {/* CI Features (included in all plans) */}
              <div className="flex items-center gap-2 text-sm">
                {!hasNoActivePaidPlan || isFreeTier ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground" />
                )}
                <span>CI History: {planFeatures.ciHistory}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {(!hasNoActivePaidPlan || isFreeTier) && planFeatures.followEntities !== "None" ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <X className="h-4 w-4 text-muted-foreground" />
                )}
                <span>Follow Entities: {planFeatures.followEntities}</span>
              </div>

              {planFeatures.tier !== "starter" && (
                <div className="flex items-center gap-2 text-sm">
                  {!hasNoActivePaidPlan && planFeatures.analytics ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>Analytics Dashboard</span>
                </div>
              )}

              {planFeatures.nextTierFeatures.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <X className="h-4 w-4 text-muted-foreground" />
                  <span>{feature.text}</span>
                </div>
              ))}

              {planFeatures.inboxTools && (
                <>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Inbox Tools Access</span>
                  </div>
                  {planFeatures.seedTests && (
                    <div className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      <span>Seed Tests: {planFeatures.seedTests}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Campaign monitoring</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    <span>Deliverability insights</span>
                  </div>
                </>
              )}

              {(planFeatures.tier === "professional" ||
                planFeatures.tier === "advanced" ||
                planFeatures.tier === "enterprise") && (
                <div className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>Personal Email Tracking (Coming Soon)</span>
                </div>
              )}
            </div>

            {canManageBilling && (
              <div className="space-y-2 pt-2">
                {isScheduledForCancellation ? (
                  <Button
                    className="w-full"
                    variant="default"
                    style={{ backgroundColor: "#EB3847", color: "white" }}
                    onClick={handleReactivateSubscription}
                    disabled={canceling}
                  >
                    {canceling ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Reactivate Subscription"
                    )}
                  </Button>
                ) : (
                  <>
                    <Button
                      className="w-full"
                      variant="default"
                      style={{ backgroundColor: "#EB3847", color: "white" }}
                      onClick={handleManageSubscription}
                    >
                      Manage Subscription
                    </Button>

                    {!hasNoActivePaidPlan && !isFreeTier && planFeatures.tier !== "starter" && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" className="w-full bg-transparent" disabled={canceling}>
                            {canceling ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Canceling...
                              </>
                            ) : (
                              "Cancel Subscription"
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-red-500" />
                              Cancel {planFeatures.name} Plan?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Your subscription will remain active until{" "}
                              {client.subscriptionRenewDate
                                ? format(new Date(client.subscriptionRenewDate), "MMMM d, yyyy")
                                : "the end of your billing period"}
                              . You'll retain full access to all {planFeatures.name} features until then. After that
                              date, you'll be downgraded to the free Starter plan.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={handleCancelSubscription}
                              className="bg-red-500 hover:bg-red-600"
                            >
                              Schedule Cancellation
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {hasNoActivePaidPlan && !isFreeTier && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-600 dark:text-yellow-500">Subscription Cancelled</h3>
                <p className="text-sm text-yellow-600/90 dark:text-yellow-500/90 mt-1">
                  Your subscription has been cancelled. You can view your existing data but cannot add new campaigns,
                  domains, or seed emails. Resubscribe to continue using all features.
                </p>
                {canManageBilling && (
                  <Button onClick={handleManageSubscription} className="mt-3" size="sm">
                    Choose a Plan
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* Subscription Details Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Subscription Details
              </CardTitle>
              <CardDescription>Important dates and information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p className="text-lg font-medium">
                    {format(new Date(client.subscriptionStartDate), "MMMM d, yyyy")}
                  </p>
                </div>

                {!isCancelled && client.subscriptionRenewDate && (
                  <div>
                    <p className="text-sm text-muted-foreground">Next Payment Date</p>
                    <p className="text-lg font-medium">
                      {format(new Date(client.subscriptionRenewDate), "MMMM d, yyyy")}
                    </p>
                  </div>
                )}

                <div>
                  <p className="text-sm text-muted-foreground">Support Level</p>
                  <p className="text-lg font-medium capitalize">{planLimits.supportLevel}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email Usage Card */}
          {/* <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Email Volume Usage
              </CardTitle>
              <CardDescription>
                Track your monthly email processing usage
                {client.lastUsageReset && (
                  <span className="block mt-1">
                    Last reset: {format(new Date(client.lastUsageReset), "MMMM d, yyyy")}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Current Usage</span>
                  <span className="font-medium">
                    {client.emailVolumeUsed.toLocaleString()} /{" "}
                    {client.emailVolumeLimit === Number.POSITIVE_INFINITY
                      ? "Unlimited"
                      : client.emailVolumeLimit.toLocaleString()}{" "}
                    emails
                  </span>
                </div>
                <Progress value={client.usagePercentage} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {client.usagePercentage.toFixed(1)}% of monthly limit used
                </p>
              </div>

              {client.usagePercentage >= 80 && client.usagePercentage < 100 && (
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                  <p className="text-sm text-yellow-600 dark:text-yellow-500">
                    You're approaching your monthly email limit. Consider upgrading your plan to avoid service
                    interruption.
                  </p>
                </div>
              )}

              {client.usagePercentage >= 100 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <p className="text-sm text-red-600 dark:text-red-500">
                    You've reached your monthly email limit. Email processing has been paused until your next billing
                    cycle or plan upgrade.
                  </p>
                </div>
              )}
            </CardContent>
          </Card> */}
        </div>
      </div>
    </div>
  )
}
