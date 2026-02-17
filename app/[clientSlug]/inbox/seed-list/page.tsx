"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { useDomain } from "@/lib/domain-context"
import { AppLayout } from "@/components/app-layout"
import SeedListContent from "@/components/seed-list-content"

export default function InboxSeedListPage({ params }: { params: { clientSlug: string } }) {
  const router = useRouter()
  const { clientSlug } = params
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [isAdminView, setIsAdminView] = useState(false)
  const { selectedDomain } = useDomain()

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

        const userData = await authResponse.json()
        setCurrentUser(userData)

        // Check if this is the admin route
        if (clientSlug === "admin") {
          // Only super_admins can access /admin
          if (userData.role !== "super_admin") {
            router.push(`/${userData.clientSlug || "login"}`)
            return
          }
          setIsAdminView(true)
          setLoading(false)
          return
        }

        // For regular client routes, verify access
        const verifyResponse = await fetch(`/api/client/verify-access?clientSlug=${clientSlug}`, {
          credentials: "include",
        })

        if (!verifyResponse.ok) {
          // User doesn't have access to this client
          if (userData.role === "super_admin") {
            router.push("/rip/admin/tools")
          } else {
            router.push(`/${userData.clientSlug || "login"}`)
          }
          return
        }

        setLoading(false)
      } catch (error) {
        console.error("Error checking authentication:", error)
        router.push("/login")
      }
    }

    checkAuth()
  }, [clientSlug, router])

  if (loading || !selectedDomain) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-rip-red" />
      </div>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={isAdminView}>
      <div className="container mx-auto py-6 px-4">
        <SeedListContent isAdminView={isAdminView} clientSlug={clientSlug} currentUser={currentUser} />
      </div>
    </AppLayout>
  )
}
