"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { BillingContent } from "@/components/billing-content"
import { Loader2 } from "lucide-react"
import AppLayout from "@/components/app-layout"

export default function AccountBillingPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const [loading, setLoading] = useState(true)
  const [isAuthorized, setIsAuthorized] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Check if user is authenticated
        const authResponse = await fetch("/api/auth/me", {
          credentials: "include",
        })

        if (!authResponse.ok) {
          router.push("/login")
          return
        }

        const user = await authResponse.json()

        // Check if first login
        if (user.firstLogin) {
          router.push("/reset-password")
          return
        }

        // For admin route, verify super_admin role
        if (clientSlug === "admin") {
          if (user.role !== "super_admin") {
            router.push("/login")
            return
          }
          setIsAuthorized(true)
          setLoading(false)
          return
        }

        // For regular client routes, verify access
        const verifyResponse = await fetch(`/api/client/verify-access?clientSlug=${clientSlug}`, {
          credentials: "include",
        })

        if (!verifyResponse.ok) {
          if (user.role === "super_admin") {
            router.push("/rip/admin/tools")
          } else {
            router.push("/login")
          }
          return
        }

        setIsAuthorized(true)
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
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthorized) {
    return null
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={clientSlug === "admin"}>
      <BillingContent clientSlug={clientSlug === "admin" ? undefined : clientSlug} />
    </AppLayout>
  )
}
