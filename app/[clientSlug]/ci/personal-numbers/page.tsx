"use client"

import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { PersonalNumbersContent } from "@/components/personal-numbers-content"
import { Loader2, Lock, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"

function StaticPersonalNumbers() {
  return (
    <div className="space-y-6 px-4 py-6 pointer-events-none select-none" aria-hidden="true">
      <div>
        <h1 className="text-3xl font-bold">Personal Numbers</h1>
        <p className="text-muted-foreground mt-1">SMS messages from phone numbers assigned to your organization appear here.</p>
      </div>
      <div className="rounded-lg border bg-card p-6 space-y-2">
        <div className="flex items-center gap-2 font-semibold">
          <Smartphone className="h-4 w-4" />
          Your Phone Numbers
        </div>
        <div className="h-4 w-2/3 rounded bg-muted/50" />
        <div className="h-4 w-1/3 rounded bg-muted/50" />
      </div>
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <div className="h-10 w-full rounded bg-muted/50" />
        <div className="h-10 w-full rounded bg-muted/50" />
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded bg-muted/50" />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PersonalNumbersPage() {
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
        <div className="relative overflow-hidden">
          <div className="blur-md opacity-60 pointer-events-none select-none">
            <StaticPersonalNumbers />
          </div>
          <div className="absolute inset-0 z-10 flex min-h-[60vh] items-center justify-center bg-background/70 backdrop-blur-sm">
            <div className="max-w-md w-full mx-4 rounded-xl border-2 border-[#dc2a28]/20 bg-card shadow-2xl p-8 text-center space-y-6">
              <div className="mx-auto w-14 h-14 rounded-full bg-[#dc2a28]/10 flex items-center justify-center">
                <Lock className="h-7 w-7 text-[#dc2a28]" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold">Personal Numbers is a Paid Feature</h2>
                <p className="text-muted-foreground text-sm">
                  Upgrade your plan to receive SMS messages from dedicated phone numbers assigned to your organization.
                </p>
              </div>
              <ul className="text-sm text-left space-y-2">
                {[
                  "Dedicated seed phone numbers for your org",
                  "See every SMS campaign in your inbox",
                  "Monitor political SMS activity in real time",
                  "Full message history with no time limit",
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
      <PersonalNumbersContent clientSlug={clientSlug} />
    </AppLayout>
  )
}
