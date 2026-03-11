"use client"

import { useParams } from "next/navigation"
import { CompetitiveInsights } from "@/components/competitive-insights"
import { AppLayout } from "@/components/app-layout"

export default function ReportsReportingPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <CompetitiveInsights clientSlug={clientSlug} defaultView="reporting" />
    </AppLayout>
  )
}
