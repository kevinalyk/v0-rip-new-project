"use client"

import { useParams, useRouter } from "next/navigation"
import { CompetitiveInsights } from "@/components/competitive-insights"
import { AppLayout } from "@/components/app-layout"
import { useEffect, useState } from "react"
import { Loader2, Lock, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import AdBanner from "@/components/ad-banner"
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts"

// Static placeholder data — never fetched, purely decorative
const staticVolumeData = [
  { day: "Mon", value: 240 },
  { day: "Tue", value: 310 },
  { day: "Wed", value: 280 },
  { day: "Thu", value: 420 },
  { day: "Fri", value: 390 },
  { day: "Sat", value: 180 },
  { day: "Sun", value: 210 },
  { day: "Mon", value: 350 },
  { day: "Tue", value: 470 },
  { day: "Wed", value: 510 },
  { day: "Thu", value: 440 },
  { day: "Fri", value: 380 },
]

const staticBarData = [
  { name: "Republican", value: 54 },
  { name: "Democrat", value: 36 },
  { name: "PAC", value: 10 },
]


function StaticCharts() {
  return (
    <div className="w-full space-y-6 pointer-events-none select-none" aria-hidden="true">
      {/* Top stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Most Active Day</p>
          <p className="text-3xl font-bold mt-1">Friday</p>
          <p className="text-xs text-muted-foreground mt-3">419 sends on this day</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Most Active Hour</p>
          <p className="text-3xl font-bold mt-1">6–7 PM</p>
          <p className="text-xs text-muted-foreground mt-3">Hour of day with the most sends</p>
        </div>
      </div>

      {/* Volume chart */}
      <div className="rounded-lg border bg-card p-6">
        <p className="font-semibold mb-1">Content Volume Over Time</p>
        <p className="text-xs text-muted-foreground mb-4">Daily email and SMS volume</p>
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={staticVolumeData}>
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#dc2a28" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#dc2a28" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Area type="monotone" dataKey="value" stroke="#dc2a28" fill="url(#colorValue)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bar row */}
      <div className="rounded-lg border bg-card p-6">
        <p className="font-semibold mb-4">Sends by Party</p>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={staticBarData}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Bar dataKey="value" fill="#dc2a28" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function ReportsReportingPage() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string
  const [subscriptionPlan, setSubscriptionPlan] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await fetch(`/api/billing?clientSlug=${clientSlug}`, { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          setSubscriptionPlan(data.client?.subscriptionPlan ?? "free")
        }
      } catch {
        setSubscriptionPlan("free")
      } finally {
        setLoading(false)
      }
    }
    fetchPlan()
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
        <AdBanner showAd={true} />
        <div className="relative overflow-hidden">
          {/* Blurred static charts in background */}
          <div className="blur-md opacity-60 pointer-events-none select-none px-4 py-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold">Analytics</h1>
            </div>
            <StaticCharts />
          </div>

          {/* Full-page paywall overlay */}
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4 rounded-xl border-2 border-[#dc2a28]/20 bg-card shadow-2xl p-8 text-center space-y-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#dc2a28]/10 flex items-center justify-center">
                <Lock className="h-7 w-7 text-[#dc2a28]" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Analytics is a Paid Feature</h2>
                <p className="text-muted-foreground text-sm">
                  Upgrade your plan to access campaign analytics, email placement data, volume trends, and more across the full political landscape.
                </p>
              </div>

              <ul className="text-sm text-left space-y-2">
                {[
                  "Email & SMS volume over time",
                  "Inbox vs. spam placement breakdown",
                  "Most active send days and hours",
                  "Filter by party, state, and message type",
                  "Third-party vs. house file analysis",
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
                <TrendingUp className="mr-2 h-4 w-4" />
                Upgrade Now
              </Button>

              <p className="text-xs text-muted-foreground">
                Contact your account manager for enterprise pricing.
              </p>
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <CompetitiveInsights clientSlug={clientSlug} defaultView="reporting" subscriptionPlan={subscriptionPlan as any} isReportingView={true} />
    </AppLayout>
  )
}
