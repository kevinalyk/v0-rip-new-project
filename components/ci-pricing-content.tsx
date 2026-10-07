"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, X, Loader2, AlertTriangle } from "lucide-react"
import { type SubscriptionPlan } from "@/lib/subscription-utils"
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
import { CancellationFeedbackFields } from "@/components/cancellation-feedback-fields"
import { Checkbox } from "@/components/ui/checkbox"

interface BillingData {
  client: {
    id: string
    name: string
    subscriptionPlan: SubscriptionPlan
    subscriptionStatus: string
    subscriptionRenewDate: string | null
    stripeSubscriptionId: string | null
  }
  userRole: string
}

type CellValue = boolean | string

interface FeatureRow {
  label: string
  note?: string
  free: CellValue
  paid: CellValue
  all: CellValue
  enterprise: CellValue
}

const FEATURE_SECTIONS: { heading: string; rows: FeatureRow[] }[] = [
  {
    heading: "Data Access",
    rows: [
      {
        label: "Campaign history",
        free: "3 hours",
        paid: "3 days",
        all: "Unlimited",
        enterprise: "Unlimited",
      },
      {
        label: "Browse email & SMS campaigns",
        free: true,
        paid: true,
        all: true,
        enterprise: true,
      },
      {
        label: "Search & filter campaigns",
        free: false,
        paid: true,
        all: true,
        enterprise: true,
      },
      {
        label: "Full directory access",
        free: true,
        paid: true,
        all: true,
        enterprise: true,
      },
    ],
  },
  {
    heading: "Following & Monitoring",
    rows: [
      {
        label: "Follow entities",
        free: false,
        paid: "Up to 3",
        all: "Unlimited",
        enterprise: "Unlimited",
      },
    ],
  },
  {
    heading: "Personal Seeds",
    rows: [
      {
        label: "Personal email (requested)",
        free: false,
        paid: true,
        all: true,
        enterprise: true,
      },
      {
        label: "Personal number",
        note: "$100/mo add-on on Basic",
        free: false,
        paid: true,
        all: true,
        enterprise: true,
      },
    ],
  },
  {
    heading: "Reports",
    rows: [
      {
        label: "Trends",
        free: false,
        paid: false,
        all: true,
        enterprise: true,
      },
      {
        label: "Inboxing",
        free: false,
        paid: false,
        all: true,
        enterprise: true,
      },
      {
        label: "Copy Frequency",
        free: false,
        paid: false,
        all: true,
        enterprise: true,
      },
      {
        label: "Subject Patterns",
        free: false,
        paid: false,
        all: true,
        enterprise: true,
      },
      {
        label: "Compliance",
        free: false,
        paid: false,
        all: true,
        enterprise: true,
      },
    ],
  },
  {
    heading: "Account",
    rows: [
      {
        label: "Users included",
        free: "1",
        paid: "1",
        all: "3",
        enterprise: "Custom",
      },
    ],
  },
]

const PLANS: { key: SubscriptionPlan; label: string; price: string; description: string }[] = [
  { key: "free", label: "Free", price: "$0", description: "Basic access" },
  { key: "paid", label: "Basic", price: "$50/mo", description: "Essential tracking" },
  { key: "all", label: "Professional", price: "$300/mo", description: "Full intelligence" },
  { key: "enterprise", label: "Enterprise", price: "Custom", description: "Custom solutions" },
]

const PLAN_LEVEL: Record<SubscriptionPlan, number> = {
  free: 0,
  paid: 1,
  all: 2,
  basic_inboxing: 3,
  enterprise: 4,
}

function CellDisplay({ value }: { value: CellValue }) {
  if (typeof value === "boolean") {
    if (value) {
      return (
        <div className="flex justify-center">
          <Check className="h-5 w-5 text-[#dc2a28]" />
        </div>
      )
    }
    return (
      <div className="flex justify-center">
        <X className="h-4 w-4 text-muted-foreground/40" />
      </div>
    )
  }
  return <div className="text-center text-sm font-medium">{value}</div>
}

export function CIPricingContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [currentPlan, setCurrentPlan] = useState<SubscriptionPlan>("free")
  const [currentStatus, setCurrentStatus] = useState<string>("active")
  const [hasActiveStripeSubscription, setHasActiveStripeSubscription] = useState(false)
  const [canManageBilling, setCanManageBilling] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkingOutPlan, setCheckingOutPlan] = useState<SubscriptionPlan | null>(null)
  const [pendingPaidPlan, setPendingPaidPlan] = useState<SubscriptionPlan | null>(null)
  const [renewalTermsAccepted, setRenewalTermsAccepted] = useState(false)
  const [clientSlug, setClientSlug] = useState<string>("")
 const [showCancelDialog, setShowCancelDialog] = useState(false)
 const [canceling, setCanceling] = useState(false)
 const [cancelReason, setCancelReason] = useState("")
 const [cancelComment, setCancelComment] = useState("")
  const [clientId, setClientId] = useState<string>("")
  const [subscriptionRenewDate, setSubscriptionRenewDate] = useState<string | null>(null)
  // null = not checked yet, false = guest, true = logged in
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    fetchBillingData()
    // Derive clientSlug from the path if we're on a /[clientSlug]/billing route
    const parts = window.location.pathname.split("/").filter(Boolean)
    if (parts.length >= 2 && parts[1] === "billing") {
      setClientSlug(parts[0])
    }
  }, [])

  // A plan selected before sign-in still requires an explicit confirmation after sign-in.
  useEffect(() => {
    if (isAuthenticated && canManageBilling) {
      const pendingPlan = searchParams.get("plan") as SubscriptionPlan | null
      if ((pendingPlan === "paid" || pendingPlan === "all") && (pendingPlan !== currentPlan || currentStatus !== "active")) {
        setPendingPaidPlan(pendingPlan)
      }
    }
  }, [isAuthenticated, canManageBilling, currentPlan, currentStatus, searchParams])

  const fetchBillingData = async () => {
    try {
      const response = await fetch("/api/billing")
      if (response.status === 401) {
        // Unauthenticated guest — show the table without a current plan highlighted
        setIsAuthenticated(false)
        return
      }
      if (!response.ok) throw new Error("Failed to fetch billing data")
      const data: BillingData = await response.json()
      setCurrentPlan(data.client.subscriptionPlan)
      setCurrentStatus(data.client.subscriptionStatus)
      setHasActiveStripeSubscription(Boolean(data.client.stripeSubscriptionId && data.client.subscriptionStatus === "active"))
      setCanManageBilling(data.userRole === "owner" || data.userRole === "admin")
      setClientId(data.client.id)
      setSubscriptionRenewDate(data.client.subscriptionRenewDate || null)
      setIsAuthenticated(true)
    } catch (error) {
      console.error("Error fetching billing data:", error)
      setIsAuthenticated(false)
    } finally {
      setLoading(false)
    }
  }

  const handleDowngradeToFree = async () => {
    if (!clientId) return
    try {
      setCanceling(true)
      await cancelSubscription(
        clientId,
        "plan",
        cancelReason ? { reason: cancelReason, comment: cancelComment } : undefined,
      )
      setShowCancelDialog(false)
      setCancelReason("")
      setCancelComment("")
      const base = clientSlug ? `/${clientSlug}` : ""
      router.push(`${base}/account/billing?cancelled=true`)
    } catch (error) {
      console.error("Error canceling subscription:", error)
      alert("Failed to cancel subscription. Please try again.")
    } finally {
      setCanceling(false)
    }
  }

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    // Guest users get redirected to login, which then returns them here with the plan pre-selected
    if (!isAuthenticated) {
      const returnUrl = `/billing?plan=${plan}`
      router.push(`/login?redirect=${encodeURIComponent(returnUrl)}`)
      return
    }

    if (!canManageBilling) {
      alert("Only your organization's owner or admin can manage its subscription.")
      return
    }

    if (plan === currentPlan && currentStatus === "active") return

    if (plan === "free") {
      if (currentPlan !== "free" && currentStatus === "active") {
        setShowCancelDialog(true)
        return
      }
      const base = clientSlug ? `/${clientSlug}` : ""
      router.push(`${base}/account/billing`)
      return
    }

    if (plan === "enterprise") {
      window.location.href = "mailto:kevin@rip-tool.com,ryan@rip-tool.com?subject=Enterprise Plan Inquiry"
      return
    }

    setRenewalTermsAccepted(false)
    setPendingPaidPlan(plan)
  }

  const handleConfirmPaidPlan = async () => {
    const plan = pendingPaidPlan
    if (!plan || !renewalTermsAccepted || !canManageBilling) return

    setCheckingOutPlan(plan)
    try {
      const result = await createCICheckoutSession({ plan, clientSlug, renewalTermsAccepted: true })
      if (result.url) {
        window.location.href = result.url
      }
    } catch (error) {
      console.error("Error creating checkout session:", error)
      alert("Failed to start checkout. Please try again.")
    } finally {
      setCheckingOutPlan(null)
      setPendingPaidPlan(null)
      setRenewalTermsAccepted(false)
    }
  }

  const isCurrentPlan = (plan: SubscriptionPlan) =>
    currentStatus === "active" && currentPlan === plan

  const getRenewDateStr = () => {
    if (!subscriptionRenewDate) return "the end of your billing period"
    return new Date(subscriptionRenewDate).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  }

  const isScheduledDowngrade = hasActiveStripeSubscription && pendingPaidPlan !== null && PLAN_LEVEL[currentPlan] > PLAN_LEVEL[pendingPaidPlan]
  const isImmediateUpgrade = hasActiveStripeSubscription && pendingPaidPlan !== null && PLAN_LEVEL[currentPlan] < PLAN_LEVEL[pendingPaidPlan]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      <AlertDialog
        open={pendingPaidPlan !== null}
        onOpenChange={(open) => {
          if (!open && checkingOutPlan === null) {
            setPendingPaidPlan(null)
            setRenewalTermsAccepted(false)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm your subscription</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3 text-left">
              <span className="block">
                {pendingPaidPlan === "all" ? "Professional is $300/month and includes 3 users. Additional users are $50/month each." : "Basic is $50/month for one user."}
                {isScheduledDowngrade
                  ? " Your existing Professional plan continues until the end of the current billing period. Basic begins at the next renewal; there is no charge today."
                  : isImmediateUpgrade
                    ? " Upgrading can invoice a prorated charge to your saved payment method now. Future charges renew monthly at the new rate."
                    : " Your subscription starts at checkout and renews automatically each month."}
                {" "}Applicable tax may be added. You can cancel in Account &gt; Billing before the next renewal to stop future charges.
              </span>
              {isImmediateUpgrade ? (
                <span className="block">This change can charge your saved payment method immediately. Review the plan and renewal terms before confirming.</span>
              ) : isScheduledDowngrade ? (
                <span className="block">Your current plan remains active until the end of its paid period.</span>
              ) : (
                <span className="block">Stripe will show the final amount, including any additional seats and tax, before payment.</span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-start gap-2">
            <Checkbox
              id="confirm-renewal-terms"
              checked={renewalTermsAccepted}
              onCheckedChange={(checked) => setRenewalTermsAccepted(checked === true)}
            />
            <label htmlFor="confirm-renewal-terms" className="text-sm leading-snug cursor-pointer">
              I agree to the monthly automatic renewal and cancellation terms above.
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={checkingOutPlan !== null}>Back</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPaidPlan}
              disabled={!renewalTermsAccepted || checkingOutPlan !== null}
            >
              {checkingOutPlan ? "Continuing..." : isScheduledDowngrade ? "Schedule downgrade" : isImmediateUpgrade ? "Confirm upgrade" : "Continue to secure checkout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Cancel Subscription and Downgrade to Free?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You&apos;re about to cancel your{" "}
                <strong>
                  {currentPlan === "paid"
                    ? "Basic"
                    : currentPlan === "all"
                      ? "Professional"
                      : "Enterprise"}
                </strong>{" "}
                subscription.
              </p>
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <p className="font-semibold text-sm mb-2">After cancellation, you will lose access to:</p>
                <ul className="text-sm space-y-1 ml-4 list-disc">
                  <li>Campaign history beyond 3 hours</li>
                  <li>CI search and filtering</li>
                  <li>Follow entities</li>
                  {currentPlan !== "paid" && <li>All reports</li>}
                  {currentPlan !== "paid" && <li>Personal email & numbers</li>}
                </ul>
              </div>
              <p className="text-sm">
                You&apos;ll maintain full access until{" "}
                <strong>{getRenewDateStr()}</strong>.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <CancellationFeedbackFields
            reason={cancelReason}
            onReasonChange={setCancelReason}
            comment={cancelComment}
            onCommentChange={setCancelComment}
          />
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

      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="text-4xl font-bold mb-2">Plans & Pricing</h1>
        <p className="text-muted-foreground text-lg">
          Compare features across all tiers
        </p>
      </div>

      {/* Comparison Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              {/* Feature column header */}
              <th className="py-5 px-6 text-left font-medium text-muted-foreground w-[30%]">
                Feature
              </th>
              {PLANS.map((plan) => (
                <th key={plan.key} className="py-5 px-4 text-center w-[17.5%]">
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-base">{plan.label}</span>
                      {isCurrentPlan(plan.key) && (
                        <Badge
                          className="text-[10px] py-0 px-1.5 h-4"
                          style={{ backgroundColor: "#dc2a28", color: "white" }}
                        >
                          Current
                        </Badge>
                      )}
                    </div>
                    <span className="text-sm font-bold">{plan.price}</span>
                    <span className="text-xs text-muted-foreground">{plan.description}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {FEATURE_SECTIONS.map((section, sectionIdx) => (
              <>
                {/* Section heading row */}
                <tr key={`section-${sectionIdx}`} className="border-t border-b bg-muted/10">
                  <td
                    colSpan={5}
                    className="py-2.5 px-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >
                    {section.heading}
                  </td>
                </tr>

                {/* Feature rows */}
                {section.rows.map((row, rowIdx) => (
                  <tr
                    key={`row-${sectionIdx}-${rowIdx}`}
                    className={`border-b transition-colors hover:bg-muted/10 ${
                      rowIdx % 2 === 1 ? "bg-muted/5" : ""
                    }`}
                  >
                    <td className="py-3.5 px-6">
                      <span className="text-sm">{row.label}</span>
                      {row.note && (
                        <span className="block text-xs text-muted-foreground mt-0.5">{row.note}</span>
                      )}
                    </td>
                    {PLANS.map((plan) => (
                      <td key={plan.key} className="py-3.5 px-4">
                        <CellDisplay
                          value={row[plan.key as keyof Omit<FeatureRow, "label" | "note">] as CellValue}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}

            {/* CTA row */}
            <tr className="border-t bg-muted/20">
              <td className="py-5 px-6" />
              {PLANS.map((plan, planIdx) => {
                const currentPlanIdx = PLANS.findIndex((p) => p.key === currentPlan)
                const isDowngrade = planIdx < currentPlanIdx
                return (
                  <td key={plan.key} className="py-5 px-4 text-center">
                    {(plan.key === "paid" || plan.key === "all") && !isCurrentPlan(plan.key) && (
                      <p className="mb-3 text-xs leading-snug text-muted-foreground">
                        {plan.key === "paid" ? "$50/month" : "$300/month, plus $50/month per user beyond 3"}; renews monthly until canceled in Account &gt; Billing.
                      </p>
                    )}
                    {isCurrentPlan(plan.key) ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled
                        className="w-full max-w-[140px]"
                      >
                        Current Plan
                      </Button>
                    ) : plan.key === "enterprise" ? (
                      <Button
                        size="sm"
                        className="w-full max-w-[140px]"
                        style={{ backgroundColor: "#dc2a28", color: "white" }}
                        onClick={() => handleSelectPlan("enterprise")}
                        disabled={checkingOutPlan !== null}
                      >
                        Contact Sales
                      </Button>
                    ) : isDowngrade ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full max-w-[140px]"
                        onClick={() => handleSelectPlan(plan.key)}
                        disabled={checkingOutPlan !== null}
                      >
                        Downgrade
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="w-full max-w-[140px]"
                        style={
                          checkingOutPlan !== plan.key
                            ? { backgroundColor: "#dc2a28", color: "white" }
                            : undefined
                        }
                        onClick={() => handleSelectPlan(plan.key)}
                        disabled={checkingOutPlan !== null}
                      >
                        {checkingOutPlan === plan.key ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          "Get Started"
                        )}
                      </Button>
                    )}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="text-center text-sm text-muted-foreground mt-6">
        <p>All plans include access to our comprehensive political campaign database.</p>
        <p className="mt-1">
          Questions?{" "}
          <a href="mailto:kevin@rip-tool.com,ryan@rip-tool.com" className="text-[#dc2a28] hover:underline">
            Contact support
          </a>
        </p>
      </div>
    </div>
  )
}
