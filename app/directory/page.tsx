"use client"

import { useEffect, useState } from "react"
import AppLayout from "@/components/app-layout"
import { CiDirectoryContent } from "@/components/ci-directory-content"

export default function PublicDirectoryPage() {
  const [clientSlug, setClientSlug] = useState("")
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const user = await res.json()
          setClientSlug(user.clientId || "")
        }
      } catch {
        // unauthenticated visitors are fine
      } finally {
        setAuthLoading(false)
      }
    }
    checkAuth()
  }, [])

  if (authLoading) return null

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <CiDirectoryContent clientSlug={clientSlug} />
    </AppLayout>
  )
}
