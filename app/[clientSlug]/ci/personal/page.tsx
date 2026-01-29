"use client"

import { useParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { PersonalEmailContent } from "@/components/personal-email-content"

export default function PersonalEmailPage() {
  const params = useParams()
  const clientSlug = params.clientSlug as string

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <PersonalEmailContent clientSlug={clientSlug} />
    </AppLayout>
  )
}
