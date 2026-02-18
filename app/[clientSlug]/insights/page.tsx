"use client"

import { useParams } from "next/navigation"
import { CompetitiveInsights } from "@/components/competitive-insights"

export default function ClientInsightsPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  return <CompetitiveInsights clientSlug={clientSlug} />
}
