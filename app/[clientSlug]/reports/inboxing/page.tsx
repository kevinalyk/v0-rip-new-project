"use client"

import { useParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { useEffect, useState } from "react"
import { Loader2, Lock } from "lucide-react"

export default function InboxingPage() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (res.ok) {
          const data = await res.json()
          setRole(data.user?.role ?? null)
        }
      } catch {
        setRole(null)
      } finally {
        setLoading(false)
      }
    }
    fetchUser()
  }, [])

  if (loading) {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={false}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  if (role !== "super_admin") {
    return (
      <AppLayout clientSlug={clientSlug} isAdminView={false}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-3">
            <Lock className="h-10 w-10 text-muted-foreground mx-auto" />
            <h2 className="text-xl font-semibold">Access Restricted</h2>
            <p className="text-sm text-muted-foreground">This page is only available to super admins.</p>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={false}>
      <div className="p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Inboxing Report</h1>
          <p className="text-sm text-muted-foreground mt-1">Email deliverability and inbox placement analytics.</p>
        </div>
        <div className="flex items-center justify-center min-h-[40vh] rounded-lg border border-dashed">
          <p className="text-muted-foreground text-sm">Coming soon — charts will appear here.</p>
        </div>
      </div>
    </AppLayout>
  )
}
