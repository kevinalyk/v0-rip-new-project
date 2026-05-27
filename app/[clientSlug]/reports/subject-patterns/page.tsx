"use client"

import { useParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { useEffect, useState } from "react"
import { Loader2, Lock, Type } from "lucide-react"
import { Button } from "@/components/ui/button"
import AdBanner from "@/components/ad-banner"
import { CiSubjectPatternsView } from "@/components/ci-subject-patterns-view"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer } from "recharts"

const staticPatternData = [
  { name: "Short", value: 38 },
  { name: "Urgency", value: 27 },
  { name: "Number/$", value: 24 },
  { name: "Question", value: 19 },
  { name: "All Caps", value: 14 },
  { name: "Emoji", value: 11 },
]

function StaticPreview() {
  return (
    <div className="w-full space-y-6 pointer-events-none select-none" aria-hidden="true">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Most Common Pattern</p>
          <p className="text-3xl font-bold mt-1">Short</p>
          <p className="text-xs text-muted-foreground mt-3">38% of subject lines under 30 chars</p>
        </div>
        <div className="rounded-lg border bg-card p-6">
          <p className="text-sm text-muted-foreground">Best Inbox Rate</p>
          <p className="text-3xl font-bold mt-1">Question</p>
          <p className="text-xs text-muted-foreground mt-3">+6.2% vs. baseline</p>
        </div>
      </div>
      <div className="rounded-lg border bg-card p-6">
        <p className="font-semibold mb-1">Pattern Frequency</p>
        <p className="text-xs text-muted-foreground mb-4">Share of subject lines matching each pattern</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={staticPatternData} layout="vertical">
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={60} />
            <Bar dataKey="value" fill="#dc2a28" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function SubjectPatternsPage() {
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

  const hasAccess = subscriptionPlan === "pro" || subscriptionPlan === "enterprise"

  if (!hasAccess) {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
        <AdBanner showAd={true} />
        <div className="relative overflow-hidden">
          <div className="blur-md opacity-60 pointer-events-none select-none px-4 py-6">
            <div className="mb-6">
              <h1 className="text-3xl font-bold">Subject Line Patterns</h1>
            </div>
            <StaticPreview />
          </div>
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4 rounded-xl border-2 border-[#dc2a28]/20 bg-card shadow-2xl p-8 text-center space-y-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#dc2a28]/10 flex items-center justify-center">
                <Lock className="h-7 w-7 text-[#dc2a28]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Subject Line Analysis is a Professional Feature</h2>
                <p className="text-muted-foreground text-sm">
                  Upgrade to Professional or Enterprise to see which subject line patterns your competitors use most — and which ones actually land in the inbox.
                </p>
              </div>
              <ul className="text-sm text-left space-y-2">
                {[
                  "Pattern frequency across thousands of subject lines",
                  "Inbox rate correlation per pattern",
                  "Party breakdown by pattern",
                  "Real subject line examples for each pattern",
                  "Filter by sender, party, state, and date range",
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
                <Type className="mr-2 h-4 w-4" />
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
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Subject Line Patterns</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Structural patterns detected across political email subject lines, with inbox rate correlation.
          </p>
        </div>
        <CiSubjectPatternsView
          clientSlug={clientSlug}
          selectedSender={[]}
          selectedPartyFilter="all"
          selectedStateFilter="all"
          dateRange={{}}
        />
      </div>
    </AppLayout>
  )
}
