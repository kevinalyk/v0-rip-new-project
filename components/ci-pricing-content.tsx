"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, Loader2, AlertTriangle } from "lucide-react"
import { PLAN_PRICES, type SubscriptionPlan } from "@/lib/subscription-utils"
import { createCICheckoutSession } from "@/app/actions/ci-stripe"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cancelSubscription } from "@/app/actions/stripe"
import { getPlanLimits } from "@/lib/subscription-utils"

interface BillingData {
  client: {
    id: string
    name: string
    subscriptionPlan: SubscriptionPlan
    subscriptionStatus: string
    subscriptionRenewDate: string | null
  }
}

const CI_PLAN_FEATURES = {
  free: ["Last 24 hours of campaigns", "Browse email and SMS campaigns", "Basic campaign details", "No follow feature"],
  paid: [
    "30 days of campaign history",
    "Follow up to 3 entities/campaigns",
    "Email and SMS campaigns",
    "Campaign analytics",
    "Advanced search and filtering",
  ],
  all: [
    "Full campaign history (unlimited)",
    "Follow unlimited entities/campaigns",
    "Email and SMS campaigns",
    "Advanced analytics",
    "Personal email tracking (coming soon)",
    "Priority support",
  ],
  basic_inboxing: [
    "Everything in 'Professional'",
    "Inbox Tools access",
    "5 seed tests per month",
    "Campaign monitoring",
    "Deliverability insights",
  ],
  enterprise: [
    "Everything in 'Advanced'",
    "Unlimited seed tests",
    "Add your own seed emails",
    "Custom integrations",
    "Dedicated account manager",
    "White-glove support",
  ],
}

export function CIPricingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan>("free")
  const [currentStatus, setCurrentStatus] = useState<string>("active")
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>("free")
  const [loading, setLoading] = useState(true)
  const [checkingOutPlan, setCheckingOutPlan] = useState<SubscriptionPlan | null>(null)
  const [clientSlug, setClientSlug] = useState<string>("")
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [clientId, setClientId] = useState<string>("")
  const [subscriptionRenewDate, setSubscriptionRenewDate] = useState<string | null>(null)

  useEffect(() => {
    fetchBillingData()
    const pathname = window.location.pathname
    const slug = pathname.split("/")[1]
    setClientSlug(slug)
  }, [])

  useEffect(() => {
    const recommendedParam = searchParams.get("recommended")
    if (recommendedParam === "all") {
      setSelectedPlan("all")
    }
  }, [searchParams])

  const fetchBillingData = async () => {
    try {
      const response = await fetch("/api/billing")
      if (!response.ok) throw new Error("Failed to fetch billing data")

      const data: BillingData = await response.json()
      setCurrentPlan(data.client.subscriptionPlan)
      setCurrentStatus(data.client.subscriptionStatus)
      setSelectedPlan(data.client.subscriptionPlan)
      setClientId(data.client.id)
      setSubscriptionRenewDate(data.client.subscriptionRenewDate || null)
    } catch (error) {
      console.error("Error fetching billing data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleDowngradeToFree = async () => {
    if (!clientId) return

    try {
      setCanceling(true)
      await cancelSubscription(clientId, "plan")

      setShowCancelDialog(false)
      router.push(`/${clientSlug}/account/billing?cancelled=true`)
    } catch (error) {
      console.error("Error canceling subscription:", error)
      alert("Failed to cancel subscription. Please try again.")
    } finally {
      setCanceling(false)
    }
  }

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (plan === currentPlan && currentStatus === "active") {
      return
    }

    if (plan === "free") {
      if (currentPlan !== "free" && currentStatus === "active") {
        setShowCancelDialog(true)
        return
      }
      router.push(`/${clientSlug}/account/billing`)
      return
    }

    setCheckingOutPlan(plan)
    try {
      const result = await createCICheckoutSession({
        plan,
        clientSlug,
      })

      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      console.error("Error creating checkout session:", error)
      alert("Failed to start checkout. Please try again.")
    } finally {
      setCheckingOutPlan(null)
    }
  }

  const isCurrentPlan = (plan: SubscriptionPlan) => {
    return currentStatus === "active" && currentPlan === plan
  }

  const getCurrentPlanFeatures = () => {
    const limits = getPlanLimits(currentPlan)
    return {
      ciHistory: currentPlan === "paid" ? "30 days" : currentPlan === "free" ? "24 hours" : "unlimited",
      followLimit:
        limits.ciFollowLimit === null
          ? "Unlimited"
          : limits.ciFollowLimit === 0
            ? "None"
            : `Up to ${limits.ciFollowLimit}`,
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Cancel Subscription and Downgrade to Free?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You're about to cancel your{" "}
                <strong>
                  {currentPlan === "paid"
                    ? "Basic"
                    : currentPlan === "all"
                      ? "Professional"
                      : currentPlan === "basic_inboxing"
                        ? "Advanced"
                        : currentPlan}
                </strong>{" "}
                subscription.
              </p>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="font-semibold text-sm mb-2">After cancellation, you will lose access to:</p>
                <ul className="text-sm space-y-1 ml-4 list-disc">
                  <li>CI History: {getCurrentPlanFeatures().ciHistory} → 24 hours only</li>
                  <li>Follow Entities: {getCurrentPlanFeatures().followLimit} → None</li>
                  {currentPlan !== "paid" && <li>Analytics Dashboard</li>}
                  {(currentPlan === "basic_inboxing" || currentPlan === "enterprise") && (
                    <>
                      <li>Inbox Tools access</li>
                      <li>Seed testing capabilities</li>
                    </>
                  )}
                </ul>
              </div>
              <p className="text-sm">
                You'll maintain full access to all your current features until{" "}
                {subscriptionRenewDate
                  ? new Date(subscriptionRenewDate).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "the end of your billing period"}
                .
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={canceling}>Keep My Subscription</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDowngradeToFree}
              disabled={canceling}
              className="bg-red-500 hover:bg-red-600"
            >
              {canceling ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Yes, Cancel Subscription"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold mb-2">Competitive Insights Pricing</h1>
        <p className="text-muted-foreground text-lg">Choose the plan that fits your campaign intelligence needs</p>
      </div>

      <div className="grid md:grid-cols-3 lg:grid-cols-3 gap-6 mb-8">
        {/* Free Plan */}
        <Card
          className={`relative transition-all flex flex-col h-full ${
            isCurrentPlan("free")
              ? "ring-2 shadow-lg cursor-not-allowed opacity-90"
              : selectedPlan === "free"
                ? "ring-2 ring-primary shadow-lg cursor-pointer"
                : "hover:shadow-md cursor-pointer"
          }`}
          style={isCurrentPlan("free") ? { borderColor: "#EB3847", borderWidth: "2px" } : undefined}
          onClick={() => !isCurrentPlan("free") && setSelectedPlan("free")}
        >
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle>Starter</CardTitle>
              {isCurrentPlan("free") && (
                <Badge style={{ backgroundColor: "#EB3847", color: "white" }}>Current Plan</Badge>
              )}
            </div>
            <CardDescription>Get started with basic access</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">${PLAN_PRICES.free}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-2">
              {CI_PLAN_FEATURES.free.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              variant="secondary"
              disabled={isCurrentPlan("free")}
              onClick={() => handleSelectPlan("free")}
            >
              {isCurrentPlan("free") ? "Current Plan" : "Free"}
            </Button>
          </CardFooter>
        </Card>

        {/* Paid Plan ($50) */}
        <Card
          className={`relative cursor-pointer transition-all flex flex-col h-full ${
            isCurrentPlan("paid")
              ? "ring-2 shadow-lg cursor-not-allowed opacity-90"
              : selectedPlan === "paid"
                ? "ring-2 ring-primary shadow-lg"
                : "hover:shadow-md"
          }`}
          style={isCurrentPlan("paid") ? { borderColor: "#EB3847", borderWidth: "2px" } : undefined}
          onClick={() => !isCurrentPlan("paid") && setSelectedPlan("paid")}
        >
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle>Basic</CardTitle>
              {isCurrentPlan("paid") && (
                <Badge style={{ backgroundColor: "#EB3847", color: "white" }}>Current Plan</Badge>
              )}
            </div>
            <CardDescription>Essential campaign tracking</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">${PLAN_PRICES.paid}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-2">
              {CI_PLAN_FEATURES.paid.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full"
              style={
                !isCurrentPlan("paid") && checkingOutPlan !== "paid"
                  ? { backgroundColor: "#EB3847", color: "white" }
                  : undefined
              }
              variant={isCurrentPlan("paid") ? "secondary" : "default"}
              disabled={isCurrentPlan("paid") || checkingOutPlan !== null}
              onClick={() => handleSelectPlan("paid")}
            >
              {checkingOutPlan === "paid" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : isCurrentPlan("paid") ? (
                "Current Plan"
              ) : (
                "Get Started"
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* All of CI ($300) - RECOMMENDED */}
        <Card
          className={`relative cursor-pointer transition-all flex flex-col h-full ${
            isCurrentPlan("all")
              ? "ring-2 shadow-lg cursor-not-allowed opacity-90"
              : selectedPlan === "all"
                ? "ring-2 shadow-lg scale-105"
                : "hover:shadow-md"
          }`}
          style={isCurrentPlan("all") ? { borderColor: "#EB3847", borderWidth: "2px" } : undefined}
          onClick={() => !isCurrentPlan("all") && setSelectedPlan("all")}
        >
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle>Professional</CardTitle>
              {isCurrentPlan("all") && (
                <Badge style={{ backgroundColor: "#EB3847", color: "white" }}>Current Plan</Badge>
              )}
            </div>
            <CardDescription>Complete campaign intelligence</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">${PLAN_PRICES.all}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-2">
              {CI_PLAN_FEATURES.all.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full hover:opacity-90"
              style={
                !isCurrentPlan("all") && checkingOutPlan !== "all"
                  ? { backgroundColor: "#EB3847", color: "white" }
                  : undefined
              }
              variant={isCurrentPlan("all") ? "secondary" : "default"}
              disabled={isCurrentPlan("all") || checkingOutPlan !== null}
              onClick={() => handleSelectPlan("all")}
            >
              {checkingOutPlan === "all" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : isCurrentPlan("all") ? (
                "Current Plan"
              ) : (
                "Get Started"
              )}
            </Button>
          </CardFooter>
        </Card>

        {/* Basic Inboxing ($1000) */}
        {/* <Card
          className={`relative cursor-pointer transition-all flex flex-col h-full ${
            isCurrentPlan("basic_inboxing")
              ? "ring-2 shadow-lg cursor-not-allowed opacity-90"
              : selectedPlan === "basic_inboxing"
                ? "ring-2 ring-primary shadow-lg"
                : "hover:shadow-md"
          }`}
          style={isCurrentPlan("basic_inboxing") ? { borderColor: "#EB3847", borderWidth: "2px" } : undefined}
          onClick={() => !isCurrentPlan("basic_inboxing") && setSelectedPlan("basic_inboxing")}
        >
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle>Advanced</CardTitle>
              {isCurrentPlan("basic_inboxing") && (
                <Badge style={{ backgroundColor: "#EB3847", color: "white" }}>Current Plan</Badge>
              )}
            </div>
            <CardDescription>CI plus inbox monitoring</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">${PLAN_PRICES.basic_inboxing}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-2">
              {CI_PLAN_FEATURES.basic_inboxing.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full hover:opacity-90"
              style={
                !isCurrentPlan("basic_inboxing") && checkingOutPlan !== "basic_inboxing"
                  ? { backgroundColor: "#EB3847", color: "white" }
                  : undefined
              }
              variant={isCurrentPlan("basic_inboxing") ? "secondary" : "default"}
              disabled={isCurrentPlan("basic_inboxing") || checkingOutPlan !== null}
              onClick={() => handleSelectPlan("basic_inboxing")}
            >
              {checkingOutPlan === "basic_inboxing" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : isCurrentPlan("basic_inboxing") ? (
                "Current Plan"
              ) : (
                "Get Started"
              )}
            </Button>
          </CardFooter>
        </Card> */}

        {/* Enterprise */}
        {/* <Card
          className={`relative cursor-pointer transition-all flex flex-col h-full ${
            isCurrentPlan("enterprise")
              ? "ring-2 shadow-lg cursor-not-allowed opacity-90"
              : selectedPlan === "enterprise"
                ? "ring-2 ring-primary shadow-lg"
                : "hover:shadow-md"
          }`}
          style={isCurrentPlan("enterprise") ? { borderColor: "#EB3847", borderWidth: "2px" } : undefined}
          onClick={() => !isCurrentPlan("enterprise") && setSelectedPlan("enterprise")}
        >
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle>Enterprise</CardTitle>
              {isCurrentPlan("enterprise") && (
                <Badge style={{ backgroundColor: "#EB3847", color: "white" }}>Current Plan</Badge>
              )}
            </div>
            <CardDescription>Custom solutions for large teams</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">Custom</span>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <ul className="space-y-2">
              {CI_PLAN_FEATURES.enterprise.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className="w-full hover:opacity-90"
              style={!isCurrentPlan("enterprise") ? { backgroundColor: "#EB3847", color: "white" } : undefined}
              variant={isCurrentPlan("enterprise") ? "secondary" : "default"}
              disabled={isCurrentPlan("enterprise")}
              onClick={() => handleSelectPlan("enterprise")}
            >
              {isCurrentPlan("enterprise") ? "Current Plan" : "Contact Sales"}
            </Button>
          </CardFooter>
        </Card> */}
      </div>

      <div className="text-center text-sm text-muted-foreground">
        <p>All plans include access to our comprehensive political campaign database</p>
        <p className="mt-1">
          Need help choosing?{" "}
          <a href="mailto:support@rip-tool.com" className="text-primary hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}
