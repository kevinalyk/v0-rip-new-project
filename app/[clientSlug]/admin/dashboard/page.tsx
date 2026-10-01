"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { TrendingEntitiesCard } from "@/components/trending-entities-card"

export default function AdminDashboardPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (clientSlug !== "rip") {
          router.push(`/${clientSlug}/ci/campaigns`)
          return
        }

        const response = await fetch("/api/auth/me", { credentials: "include" })
        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()

        if (user.firstLogin) {
          router.push("/reset-password")
          return
        }

        if (user.role !== "super_admin") {
          router.push("/login")
          return
        }

        setAuthorized(true)
      } catch (error) {
        console.error("Auth check failed:", error)
        router.push("/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [router, clientSlug])

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!authorized) {
    return null
  }

  return (
    <AppLayout isAdminView={true}>
      <div className="container mx-auto py-8 px-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">RIP-wide insights. More cards coming soon.</p>
        </div>

        <div className="grid gap-6">
          <TrendingEntitiesCard />
        </div>
      </div>
    </AppLayout>
  )
}
