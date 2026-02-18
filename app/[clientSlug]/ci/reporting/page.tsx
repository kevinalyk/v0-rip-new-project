"use client"

import { useParams } from "next/navigation"
import { CompetitiveInsights } from "@/components/competitive-insights"
import { AppLayout } from "@/components/app-layout"
import { useEffect } from "react"

export default function CIReportingPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  // Force the reporting view by setting a URL hash
  useEffect(() => {
    // This will help the component know to show reporting view
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#reporting`)
    }
  }, [])

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <CompetitiveInsights clientSlug={clientSlug} defaultView="reporting" />
    </AppLayout>
  )
}
