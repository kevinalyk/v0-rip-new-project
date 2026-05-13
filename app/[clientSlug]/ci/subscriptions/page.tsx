"use client"

import { useParams, useRouter } from "next/navigation"
import { CompetitiveInsights } from "@/components/competitive-insights"
import { AppLayout } from "@/components/app-layout"
import { useEffect, useState } from "react"
import { Loader2, Lock, Star } from "lucide-react"
import { Button } from "@/components/ui/button"

function StaticFollowing() {
  return (
    <div className="space-y-6 px-4 py-6 pointer-events-none select-none" aria-hidden="true">
      <div>
        <h1 className="text-3xl font-bold">Competitive Insights</h1>
        <p className="text-muted-foreground mt-1">Track and analyze political campaigns from across the spectrum</p>
      </div>
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="h-10 w-full rounded bg-muted/50" />
        <div className="flex gap-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-9 flex-1 rounded bg-muted/50" />
          ))}
        </div>
      </div>
      <div className="rounded-lg border bg-card">
        <div className="grid grid-cols-3 gap-0 border-b">
          {["Sender", "Subject", "Date"].map((h) => (
            <div key={h} className="px-4 py-3 text-sm font-medium text-muted-foreground">{h}</div>
          ))}
        </div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="grid grid-cols-3 gap-0 border-b last:border-0">
            <div className="px-4 py-3"><div className="h-4 w-3/4 rounded bg-muted/50" /></div>
            <div className="px-4 py-3"><div className="h-4 w-full rounded bg-muted/50" /></div>
            <div className="px-4 py-3"><div className="h-4 w-1/2 rounded bg-muted/50" /></div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CISubscriptionsPage() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSubscriptionPlan = async () => {
      try {
        const response = await fetch(`/api/billing?clientSlug=${clientSlug}`, {
          credentials: "include",
        })
        if (response.ok) {
          const data = await response.json()
          setSubscriptionPlan(data.client?.subscriptionPlan ?? "free")
        }
      } catch (error) {
        console.error("Error fetching subscription plan:", error)
        setSubscriptionPlan("free")
      } finally {
        setLoading(false)
      }
    }
    fetchSubscriptionPlan()
  }, [clientSlug])

  if (loading) {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  const isFree = subscriptionPlan === "free"

  if (isFree) {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
        <div className="relative overflow-hidden">
          <div className="blur-md opacity-60 pointer-events-none select-none">
            <StaticFollowing />
          </div>
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4 rounded-xl border-2 border-[#dc2a28]/20 bg-card shadow-2xl p-8 text-center space-y-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#dc2a28]/10 flex items-center justify-center">
                <Lock className="h-7 w-7 text-[#dc2a28]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Following is a Paid Feature</h2>
                <p className="text-muted-foreground text-sm">
                  Upgrade your plan to follow specific candidates and organizations and see their campaigns the moment they send.
                </p>
              </div>
              <ul className="text-sm text-left space-y-2">
                {[
                  "Follow unlimited candidates and organizations",
                  "Get notified when followed entities send campaigns",
                  "Filter your feed by followed entities only",
                  "Full send history with no time limit",
                  "Receive daily digest emails for followed entities",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#dc2a28]" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                className="w-full bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white"
                onClick={() => router.push(`/${clientSlug}/billing`)}
              >
                Upgrade Now
              </Button>
              <p className="text-xs text-muted-foreground">Contact your account manager for enterprise pricing.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <CompetitiveInsights
        clientSlug={clientSlug}
        subscriptionsOnly={true}
        subscriptionPlan={subscriptionPlan as any}
      />
    </AppLayout>
  )
}
