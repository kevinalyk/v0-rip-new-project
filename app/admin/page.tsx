"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function AdminPage() {
  const router = useRouter()

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
            router.push(`/${slug}/ci/campaigns`)
          } else {
            router.push("/login")
          }
          return
        }

        router.push("/admin/ci/campaigns")
      } catch (error) {
        console.error("Auth check error:", error)
        router.push("/login")
      }
    }

    checkSuperAdmin()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#dc2a28]"></div>
    </div>
  )
}
