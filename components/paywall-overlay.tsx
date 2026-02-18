"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Lock, Sparkles, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useRouter, usePathname } from "next/navigation"

interface PaywallOverlayProps {
  title: string
  description: string
  features: string[]
  currentPlan: "starter" | "professional" | "enterprise"
  upgradePlan?: string
  upgradePrice?: string
  upgradeNote?: string
  // Legacy prop for backward compatibility
  requiredPlan?: "professional" | "enterprise"
  isPreview?: boolean
  upgradeType?: "plan" | "addon"
  targetPlan?: "professional" | "enterprise"
}

export function PaywallOverlay({
  title,
  description,
  features,
  currentPlan,
  upgradePlan,
  upgradePrice,
  upgradeNote,
  requiredPlan,
  isPreview = false,
  upgradeType = "plan",
  targetPlan,
}: PaywallOverlayProps) {
  const router = useRouter()
  const pathname = usePathname()

  const getPlanPrice = (plan: string) => {
    switch (plan) {
      case "professional":
        return "$1,000"
      case "enterprise":
        return "Custom"
      default:
        return ""
    }
  }

  const displayUpgradePlan =
    upgradePlan || (requiredPlan ? requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1) : "")
  const displayUpgradePrice = upgradePrice || (requiredPlan ? getPlanPrice(requiredPlan) : "")

  const handleUpgrade = () => {
    const clientSlug = pathname.split("/")[1]
    const params = new URLSearchParams()
    params.append("returnTo", pathname)

    if (upgradeType === "addon") {
      params.append("addon", "ci")
    } else if (targetPlan) {
      params.append("plan", targetPlan)
    } else if (requiredPlan) {
      params.append("plan", requiredPlan)
    }

    router.push(`/${clientSlug}/billing?${params.toString()}`)
  }

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="max-w-lg mx-4 border-2 border-[#dc2a28]/20 shadow-xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-[#dc2a28]/10 flex items-center justify-center mb-2">
            <Lock className="h-6 w-6 text-[#dc2a28]" />
          </div>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="text-base">{description}</CardDescription>
          {isPreview && (
            <Badge variant="secondary" className="mx-auto">
              <Sparkles className="h-3 w-3 mr-1" />
              Preview Mode - Showing 5 campaigns
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">
              {upgradePlan ? `Add ${displayUpgradePlan} to unlock:` : `Upgrade to ${displayUpgradePlan} to unlock:`}
            </p>
            <ul className="space-y-2">
              {features.map((feature, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <div className="mt-0.5">
                    <div className="h-1.5 w-1.5 rounded-full bg-[#dc2a28]" />
                  </div>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            {upgradeNote && <p className="text-xs italic text-muted-foreground mt-2">Note: {upgradeNote}</p>}
          </div>

          <div className="pt-4 border-t space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current Plan:</span>
              <Badge variant="outline">{currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{upgradePlan ? "Add:" : "Upgrade to:"}</span>
              <div className="text-right">
                <div className="font-semibold">{displayUpgradePlan}</div>
                <div className="text-sm text-muted-foreground">{displayUpgradePrice}/month</div>
              </div>
            </div>
          </div>

          <Button className="w-full bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white" size="lg" onClick={handleUpgrade}>
            <TrendingUp className="mr-2 h-4 w-4" />
            {upgradePlan ? "Add to Plan" : "Upgrade Now"}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Payment integration coming soon. Contact your account manager for immediate access.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
