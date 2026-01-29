"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, Loader2 } from "lucide-react"
import { PLAN_PRICES, CI_ADDON_PRICE, type SubscriptionPlan, type SubscriptionStatus } from "@/lib/subscription-utils"
import { createCheckoutSession } from "@/app/actions/stripe"

interface BillingData {
  client: {
    id: string
    name: string
    subscriptionPlan: SubscriptionPlan
    subscriptionStatus: SubscriptionStatus // Added subscriptionStatus to interface
    hasCompetitiveInsights: boolean
    emailVolumeLimit: number
    emailVolumeUsed: number
  }
}

const PLAN_FEATURES = {
  starter: ["Up to 2,000 emails received a month", "Email support"],
  professional: [
    "Up to 20,000 emails received a month",
    "Email support",
    "Analytics dashboard",
    "Add your own seed list",
  ],
  enterprise: [
    "Unlimited emails received",
    "Dedicated support",
    "Analytics dashboard",
    "Add your own seed list",
    "Customize seed list personas",
    "Unlimited access to Competitive Insights",
  ],
}

const CI_ADDON_FEATURES = [
  "Unlimited access to the Competitive Insights database",
  "See what political campaigns are sending",
]

export function PlanSelectionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan>("starter")
  const [currentHasCI, setCurrentHasCI] = useState(false)
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>("active")
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>("starter")
  const [selectedHasCI, setSelectedHasCI] = useState(false)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [clientSlug, setClientSlug] = useState<string>("")

  useEffect(() => {
    fetchBillingData()
    const pathname = window.location.pathname
    const slug = pathname.split("/")[1]
    setClientSlug(slug)
  }, [])

  useEffect(() => {
    const preselectedPlan = searchParams.get("plan") as SubscriptionPlan | null
    const preselectedCI = searchParams.get("addon") === "ci"

    if (preselectedPlan && ["starter", "professional", "enterprise"].includes(preselectedPlan)) {
      setSelectedPlan(preselectedPlan)
    }

    if (preselectedCI) {
      setSelectedHasCI(true)
    }
  }, [searchParams])

  const fetchBillingData = async () => {
    try {
      const response = await fetch("/api/billing")
      if (!response.ok) throw new Error("Failed to fetch billing data")

      const data: BillingData = await response.json()
      setCurrentPlan(data.client.subscriptionPlan)
      setCurrentHasCI(data.client.hasCompetitiveInsights)
      setSubscriptionStatus(data.client.subscriptionStatus)
      setSelectedPlan(data.client.subscriptionPlan)
      setSelectedHasCI(data.client.hasCompetitiveInsights)
    } catch (error) {
      console.error("Error fetching billing data:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateSubscription = async () => {
    setUpdating(true)
    try {
      const isCancelled = subscriptionStatus === "cancelled"
      const isPaidUpgrade =
        isCancelled ||
        (selectedPlan !== "starter" && selectedPlan !== currentPlan) ||
        (selectedHasCI && !currentHasCI && selectedPlan !== "enterprise")

      if (isPaidUpgrade) {
        const result = await createCheckoutSession({
          plan: selectedPlan,
          hasCompetitiveInsights: selectedHasCI,
          clientSlug: clientSlug,
        })

        if (result.url) {
          window.location.href = result.url
          return
        }
      }

      const response = await fetch("/api/billing/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionPlan: selectedPlan,
          hasCompetitiveInsights: selectedHasCI,
        }),
      })

      if (!response.ok) throw new Error("Failed to update subscription")

      router.refresh()

      const returnTo = searchParams.get("returnTo")
      if (returnTo) {
        router.push(returnTo)
      } else {
        window.location.href = window.location.pathname.replace("/billing", "?tab=billing")
      }
    } catch (error) {
      console.error("Error updating subscription:", error)
      alert("Failed to update subscription. Please try again.")
    } finally {
      setUpdating(false)
    }
  }

  const hasChanges =
    subscriptionStatus === "cancelled" || selectedPlan !== currentPlan || selectedHasCI !== currentHasCI

  const isDowngrade = () => {
    if (subscriptionStatus === "cancelled") return false
    const planOrder = { starter: 0, professional: 1, enterprise: 2 }
    return planOrder[selectedPlan] < planOrder[currentPlan] || (!selectedHasCI && currentHasCI)
  }

  const isCurrentPlan = (plan: SubscriptionPlan) => {
    return subscriptionStatus === "active" && currentPlan === plan
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
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Choose Your Plan</h1>
        <p className="text-muted-foreground">
          Select the plan that best fits your needs. You can upgrade or downgrade at any time.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6 mb-8">
        <Card
          className={`relative cursor-pointer transition-all ${
            selectedPlan === "starter" ? "ring-2 ring-[#dc2a28] shadow-lg" : "hover:shadow-md"
          }`}
          onClick={() => setSelectedPlan("starter")}
        >
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle>Starter</CardTitle>
              {isCurrentPlan("starter") && <Badge variant="secondary">Current Plan</Badge>}
            </div>
            <CardDescription>Perfect for individual campaigns and small teams</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">${PLAN_PRICES.starter}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {PLAN_FEATURES.starter.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-[#dc2a28] shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className={`w-full ${selectedPlan === "starter" ? "bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white" : ""}`}
              variant={selectedPlan === "starter" ? "default" : "outline"}
              onClick={() => setSelectedPlan("starter")}
            >
              {isCurrentPlan("starter") ? "Current Plan" : "Get Started"}
            </Button>
          </CardFooter>
        </Card>

        <Card
          className={`relative cursor-pointer transition-all ${
            selectedPlan === "professional" ? "ring-2 ring-[#dc2a28] shadow-lg" : "hover:shadow-md"
          }`}
          onClick={() => setSelectedPlan("professional")}
        >
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle>Professional</CardTitle>
              {isCurrentPlan("professional") && <Badge variant="secondary">Current Plan</Badge>}
            </div>
            <CardDescription>For larger campaigns, organizations, and agencies</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">${PLAN_PRICES.professional}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {PLAN_FEATURES.professional.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-[#dc2a28] shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className={`w-full ${selectedPlan === "professional" ? "bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white" : ""}`}
              variant={selectedPlan === "professional" ? "default" : "outline"}
              onClick={() => setSelectedPlan("professional")}
            >
              {isCurrentPlan("professional") ? "Current Plan" : "Get Started"}
            </Button>
          </CardFooter>
        </Card>

        <Card
          className={`relative cursor-pointer transition-all ${
            selectedPlan === "enterprise" ? "ring-2 ring-[#dc2a28] shadow-lg" : "hover:shadow-md"
          }`}
          onClick={() => setSelectedPlan("enterprise")}
        >
          <CardHeader>
            <div className="flex items-center justify-between mb-2">
              <CardTitle>Enterprise</CardTitle>
              {isCurrentPlan("enterprise") && <Badge variant="secondary">Current Plan</Badge>}
            </div>
            <CardDescription>For large campaigns and political organizations</CardDescription>
            <div className="mt-4">
              <span className="text-4xl font-bold">Custom</span>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {PLAN_FEATURES.enterprise.map((feature, index) => (
                <li key={index} className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-[#dc2a28] shrink-0 mt-0.5" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              className={`w-full ${selectedPlan === "enterprise" ? "bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white" : ""}`}
              variant={selectedPlan === "enterprise" ? "default" : "outline"}
              onClick={() => setSelectedPlan("enterprise")}
            >
              {isCurrentPlan("enterprise") ? "Current Plan" : "Get Started"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {selectedPlan !== "enterprise" && (
        <div className="flex justify-center mb-8">
          <Card className="w-full max-w-2xl ring-2 ring-[#dc2a28]">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Competitive Insights Only</CardTitle>
                  <CardDescription className="mt-2">Access our comprehensive political email database</CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold">${CI_ADDON_PRICE}</div>
                  <div className="text-sm text-muted-foreground">/month</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {CI_ADDON_FEATURES.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="h-5 w-5 text-[#dc2a28] shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground italic mt-4 pt-4 border-t">
                Note: This plan does not include other features
              </p>
            </CardContent>
            <CardFooter>
              <Button
                className={`w-full ${selectedHasCI ? "bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white" : ""}`}
                variant={selectedHasCI ? "default" : "outline"}
                onClick={() => setSelectedHasCI(!selectedHasCI)}
              >
                {selectedHasCI ? "Selected" : "Get Started"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <Button
          variant="outline"
          onClick={() => {
            const returnTo = searchParams.get("returnTo")
            if (returnTo) {
              router.push(returnTo)
            } else {
              router.back()
            }
          }}
        >
          Cancel
        </Button>

        <div className="flex items-center gap-4">
          {hasChanges && (
            <div className="text-sm text-muted-foreground">
              {subscriptionStatus === "cancelled" ? (
                <span className="text-green-600">✓ Starting new subscription</span>
              ) : isDowngrade() ? (
                <span className="text-yellow-600">⚠️ This is a downgrade</span>
              ) : (
                <span className="text-green-600">✓ Upgrading your plan</span>
              )}
            </div>
          )}
          <Button onClick={handleUpdateSubscription} disabled={!hasChanges || updating} size="lg">
            {updating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {subscriptionStatus === "cancelled"
                  ? "Continue to Checkout"
                  : isDowngrade()
                    ? "Downgrade Plan"
                    : "Continue to Checkout"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
