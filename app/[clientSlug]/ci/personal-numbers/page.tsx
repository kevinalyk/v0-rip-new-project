"use client"

import { useParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { PersonalNumbersContent } from "@/components/personal-numbers-content"

export default function PersonalNumbersPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <PersonalNumbersContent clientSlug={clientSlug} />
    </AppLayout>
  )
}
