"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AppLayout } from "@/components/app-layout"
import { SpamTestContent } from "@/components/spam-test-content"
import { Loader2 } from "lucide-react"

export default function SpamTestPage() {
  const params = useParams()
  const router = useRouter()
  const clientSlug = params.clientSlug as string

  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" })
        if (!res.ok) {
          router.push("/login")
          return
        }
        const me = await res.json()
        const role = me.role ?? null
        const slug = me.client?.slug ?? ""
        setUserRole(role === "super_admin" || slug === "redsparkstrategy" ? "super_admin" : role)
      } catch {
        router.push("/login")
      } finally {
        setLoading(false)
      }
    }
    checkAuth()
  }, [router])

  if (loading) {
    return (
      <AppLayout clientSlug={clientSlug}>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={userRole === "super_admin"}>
      <SpamTestContent clientSlug={clientSlug} />
    </AppLayout>
  )
}
