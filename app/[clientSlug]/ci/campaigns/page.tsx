"use client"

import { useParams } from "next/navigation"
import { CompetitiveInsights } from "@/components/competitive-insights"
import { AppLayout } from "@/components/app-layout"
import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

export default function CICampaignsPage() {
  const params = useParams()
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
          setSubscriptionPlan(data.client.subscriptionPlan)
        }
      } catch (error) {
        console.error("Error fetching subscription plan:", error)
      } finally {
        setLoading(false)
      }
    }
    fetchSubscriptionPlan()
  }, [clientSlug])

  if (loading) {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <CompetitiveInsights clientSlug={clientSlug} subscriptionPlan={subscriptionPlan as any} />
    </AppLayout>
  )
}
