"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { AdminComplianceSummary } from "@/components/admin-compliance-summary"
import { Button } from "@/components/ui/button"
import { Loader2, Lock, ShieldCheck, TrendingUp } from "lucide-react"

export default function ComplianceReportPage() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string

  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [billingRes, meRes] = await Promise.all([
          fetch(`/api/billing?clientSlug=${clientSlug}`, { credentials: "include" }),
          fetch("/api/auth/me", { credentials: "include" }),
        ])
        if (billingRes.ok) {
          const data = await billingRes.json()
          setSubscriptionPlan(data.client?.subscriptionPlan ?? "free")
        } else {
          setSubscriptionPlan("free")
        }
        if (meRes.ok) {
          const me = await meRes.json()
          setUserRole(me.role ?? null)
        }
      } catch {
        setSubscriptionPlan("free")
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [clientSlug])

  const isSuperAdmin = userRole === "super_admin"
  // "all" = Professional ($300), "enterprise" = Enterprise
  const hasAccess = isSuperAdmin || subscriptionPlan === "all" || subscriptionPlan === "enterprise"

  if (loading) {
    return (
      <AppLayout clientSlug={clientSlug}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  if (!hasAccess) {
    return (
      <AppLayout clientSlug={clientSlug}>
        <div className="relative overflow-hidden min-h-screen">
          {/* Blurred background */}
          <div className="blur-md opacity-50 pointer-events-none select-none px-4 py-6 space-y-4">
            <div className="h-8 w-64 bg-muted rounded" />
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border bg-card p-6 h-48" />
              <div className="rounded-lg border bg-card p-6 h-48" />
            </div>
            <div className="rounded-lg border bg-card p-6 h-64" />
          </div>

          {/* Paywall overlay */}
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4 rounded-xl border-2 border-[#dc2a28]/20 bg-card shadow-2xl p-8 text-center space-y-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#dc2a28]/10 flex items-center justify-center">
                <Lock className="h-7 w-7 text-[#dc2a28]" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Deliverability is a Professional Feature</h2>
                <p className="text-muted-foreground text-sm">
                  Upgrade to Professional or Enterprise to access aggregated email compliance scoring and authentication analysis across Republican and Democrat senders.
                </p>
              </div>

              <ul className="text-sm text-left space-y-2">
                {[
                  "SPF, DKIM, DMARC authentication scores",
                  "Inbox vs. spam placement rates by party",
                  "One-click unsubscribe compliance",
                  "Subject line and sender compliance checks",
                  "Aggregated Republican vs. Democrat breakdown",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#dc2a28] shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="w-full bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white"
                onClick={() => router.push(`/${clientSlug}/billing`)}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                Upgrade to Professional
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug}>
      <div className="container mx-auto py-8 px-4">
        <AdminComplianceSummary />
      </div>
    </AppLayout>
  )
}
