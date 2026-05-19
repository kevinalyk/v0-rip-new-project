"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { AdminChangelog } from "@/components/admin-changelog"
import { AppLayout } from "@/components/app-layout"

export default function AdminChangelogPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        if (clientSlug !== "rip") {
          router.push(`/${clientSlug}/ci/campaigns`)
          return
        }

        const response = await fetch("/api/auth/me", { credentials: "include" })
        if (!response.ok) { router.push("/login"); return }

        const user = await response.json()
        if (user.role !== "super_admin") {
          router.push(`/${clientSlug}`)
          return
        }

        setLoading(false)
      } catch {
        setError("Authentication error. Please try logging in again.")
        setTimeout(() => router.push("/login"), 1000)
      }
    }
    checkSuperAdmin()
  }, [router, clientSlug])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error}</div>
        <button className="px-4 py-2 bg-rip-red text-white rounded" onClick={() => router.push("/login")}>
          Go to Login
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rip-red" />
      </div>
    )
  }

  return (
    <AppLayout isAdminView={true}>
      <div className="container mx-auto py-8 px-4">
        <AdminChangelog />
      </div>
    </AppLayout>
  )
}
