"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { ContentFrequency } from "@/components/content-frequency"
import { Button } from "@/components/ui/button"
import { Loader2, Lock, TrendingUp } from "lucide-react"

// Static placeholder rows — purely decorative for the upgrade wall backdrop
const STATIC_ROWS = [
  { rank: 1, preview: "URGENT: Final notice before midnight deadline — donate NOW", entity: "Senate Leadership Fund", party: "Republican", days: 14 },
  { rank: 2, preview: "Your gift will be MATCHED 3x if you act in the next hour", entity: "Democratic Congressional Campaign Committee", party: "Democrat", days: 11 },
  { rank: 3, preview: "We need to hear from you before the FEC deadline tonight", entity: "National Republican Senatorial Committee", party: "Republican", days: 9 },
  { rank: 4, preview: "Due TONIGHT: Your exclusive invitation expires at midnight", entity: "ActBlue", party: "Democrat", days: 8 },
  { rank: 5, preview: "We've been trying to reach you. This is urgent.", entity: "America First Action", party: "Republican", days: 7 },
  { rank: 6, preview: "Friend, we need 500 more gifts before 11:59 PM", entity: "Swing Left", party: "Democrat", days: 6 },
  { rank: 7, preview: "[First Name], your district is a top target — we need you", entity: "House Majority PAC", party: "Democrat", days: 6 },
  { rank: 8, preview: "FINAL HOURS: Triple match ends at midnight", entity: "Republican National Committee", party: "Republican", days: 5 },
]

function StaticTable() {
  return (
    <div className="overflow-x-auto pointer-events-none select-none" aria-hidden="true">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
            <th className="text-left py-3 px-4 w-8 font-medium">#</th>
            <th className="text-left py-3 px-4 font-medium">Subject / Preview</th>
            <th className="text-left py-3 px-4 font-medium">Entity</th>
            <th className="text-right py-3 px-4 font-medium">Send Days</th>
            <th className="text-right py-3 px-4 font-medium">Last Sent</th>
          </tr>
        </thead>
        <tbody>
          {STATIC_ROWS.map((row) => (
            <tr key={row.rank} className="border-b last:border-0">
              <td className="py-3 px-4 text-muted-foreground font-mono text-xs">{row.rank}</td>
              <td className="py-3 px-4 max-w-md">
                <p className="leading-relaxed text-foreground">{row.preview}</p>
              </td>
              <td className="py-3 px-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-xs">{row.entity}</span>
                  <span className={`inline-block w-fit text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    row.party === "Republican" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
                  }`}>
                    {row.party}
                  </span>
                </div>
              </td>
              <td className="py-3 px-4 text-right">
                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-xs px-2.5 py-1">
                  {row.days}
                </span>
              </td>
              <td className="py-3 px-4 text-right text-muted-foreground text-xs">May 19, 2026</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ContentFrequencyPage() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string

  const [subscriptionPlan, setSubscriptionPlan] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        const res = await fetch(`/api/billing?clientSlug=${clientSlug}`, { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          setSubscriptionPlan(data.client?.subscriptionPlan ?? "free")
        }
        // Also get role from /api/auth/me
        const meRes = await fetch("/api/auth/me", { credentials: "include" })
        if (meRes.ok) {
          const me = await meRes.json()
          setUserRole(me.user?.role ?? null)
        }
      } catch {
        setSubscriptionPlan("free")
      } finally {
        setLoading(false)
      }
    }
    fetchPlan()
  }, [clientSlug])

  const isSuperAdmin = userRole === "super_admin"
  const hasAccess = isSuperAdmin || subscriptionPlan === "pro" || subscriptionPlan === "enterprise"

  if (loading) {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  if (!hasAccess) {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
        <div className="relative overflow-hidden">
          {/* Blurred static table in background */}
          <div className="blur-sm opacity-40 pointer-events-none select-none px-0 py-6" aria-hidden="true">
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Copy Frequency</h1>
              <p className="text-muted-foreground text-sm mt-1">
                The most frequently sent email subjects, email body copy, and SMS messages.
              </p>
            </div>
            <div className="flex gap-4 mb-6">
              {["Email Subjects", "Email Body", "SMS Copy"].map((t) => (
                <div key={t} className="px-4 py-2 rounded-md border text-sm font-medium">{t}</div>
              ))}
            </div>
            <div className="rounded-lg border bg-card">
              <StaticTable />
            </div>
          </div>

          {/* Upgrade wall overlay */}
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4 rounded-xl border-2 border-primary/20 bg-card shadow-2xl p-8 text-center space-y-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <Lock className="h-7 w-7 text-primary" />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Copy Frequency is a $300+ Feature</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  See which email subjects, body copy, and SMS messages are being sent repeatedly across the political landscape — a strong signal that the copy is working.
                </p>
              </div>

              <ul className="text-sm text-left space-y-2">
                {[
                  "Most repeated email subject lines, ranked by send days",
                  "Most reused email body copy across all senders",
                  "Most frequently deployed SMS messages",
                  "Filter by party, source, entity, and date range",
                  "Identify winning copy patterns before your competitors do",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                size="lg"
                className="w-full"
                onClick={() => router.push(`/${clientSlug}/billing`)}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                Upgrade to $300 Plan
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
      <div className="p-6">
        <ContentFrequency clientSlug={clientSlug} />
      </div>
    </AppLayout>
  )
}
