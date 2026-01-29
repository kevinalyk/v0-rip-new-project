"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { CiEntityManagement } from "@/components/ci-entity-management"
import { AppLayout } from "@/components/app-layout"

export default function AdminCiEntitiesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me")
        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()

        // Check if user needs to reset password
        if (user.firstLogin) {
          router.push("/reset-password")
          return
        }

        // Only super_admins can access admin CI entities
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
  }, [router])

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
      <CiEntityManagement clientSlug="admin" />
    </AppLayout>
  )
}
