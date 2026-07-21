"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Loader2 } from "lucide-react"
import { InboxComingSoon } from "@/components/inbox-coming-soon"

export default function InboxLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const [loading, setLoading] = useState(true)
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    const checkAccess = async () => {
      try {
        // Check if user is authenticated
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        })

        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()
        const userClientSlug = user.client?.slug ?? ""

        // Super admins always get in; Red Spark also has access to Inbox Tools
        const allowed =
          user.role === "super_admin" ||
          userClientSlug === "redsparkstrategy" ||
          clientSlug === "redsparkstrategy"

        setHasAccess(allowed)
        setLoading(false)
      } catch (error) {
        console.error("Auth check error:", error)
        router.push("/login")
      }
    }

    checkAccess()
  }, [clientSlug, router])

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-rip-red" />
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (!hasAccess) {
    return <InboxComingSoon />
  }

  return <>{children}</>
}
