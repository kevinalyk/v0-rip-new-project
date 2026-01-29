"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AdminContent } from "@/components/admin-content"
import { AppLayout } from "@/components/app-layout"

export default function AdminToolsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        })

        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()

        if (user.role !== "super_admin") {
          // Not a super-admin, redirect to their client page
          const clientResponse = await fetch("/api/client/slug", {
            credentials: "include",
          })

          if (clientResponse.ok) {
            const { slug } = await clientResponse.json()
            router.push(`/${slug}`)
          } else {
            router.push("/login")
          }
          return
        }

        setLoading(false)
      } catch (error) {
        console.error("Auth check error:", error)
        setError("Authentication error. Please try logging in again.")
        setTimeout(() => router.push("/login"), 1000)
      }
    }

    checkSuperAdmin()
  }, [router])

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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rip-red"></div>
      </div>
    )
  }

  return (
    <AppLayout isAdminView={true}>
      <div className="container mx-auto py-8 px-4">
        <AdminContent />
      </div>
    </AppLayout>
  )
}
