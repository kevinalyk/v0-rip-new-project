"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { ReportingContent } from "@/components/reporting-content"
import { AppLayout } from "@/components/app-layout"
import { Loader2 } from "lucide-react"

export default function InboxReportingPage() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string

  const [isAdminView, setIsAdminView] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        })

        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()

        // Check if this is the admin route
        const isAdmin = clientSlug === "admin"
        setIsAdminView(isAdmin)

        // If non-super_admin tries to access admin route, redirect
        if (isAdmin && user.role !== "super_admin") {
          const clientResponse = await fetch("/api/client/slug", {
            credentials: "include",
          })
          if (clientResponse.ok) {
            const { slug } = await clientResponse.json()
            router.push(`/${slug}/inbox/reporting`)
          } else {
            router.push("/login")
          }
          return
        }

        setAuthChecked(true)
      } catch (error) {
        console.error("Auth check error:", error)
        router.push("/login")
      }
    }

    checkAuth()
  }, [clientSlug, router])

  if (!authChecked) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  // For admin route, don't pass clientSlug to the component
  // For regular client routes, pass the clientSlug
  const componentProps = isAdminView ? { isAdminView: true } : { isAdminView: false, clientSlug }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={isAdminView}>
      <div className="min-h-screen bg-background">
        <ReportingContent {...componentProps} />
      </div>
    </AppLayout>
  )
}
