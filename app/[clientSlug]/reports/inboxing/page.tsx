"use client"

import { useParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"

export default function InboxingPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <div />
    </AppLayout>
  )
}
