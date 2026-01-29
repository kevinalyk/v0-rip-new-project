"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        })

        if (!response.ok) {
          // Not authenticated, redirect to login
          router.push("/login")
          return
        }

        const user = await response.json()

        // Check if first login
        if (user.firstLogin) {
          router.push(`/reset-password?email=${encodeURIComponent(user.email)}`)
          return
        }

        // Redirect based on role
        if (user.role === "super_admin") {
          router.push("/admin")
        } else {
          // Get user's client slug and redirect
          const clientResponse = await fetch("/api/client/slug", {
            credentials: "include",
          })

          if (clientResponse.ok) {
            const { slug } = await clientResponse.json()
            router.push(`/${slug}`)
          } else {
            // Fallback if no slug found
            router.push("/login")
          }
        }
      } catch (error) {
        console.error("Auth check error:", error)
        router.push("/login")
      }
    }

    checkAuthAndRedirect()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#dc2a28]"></div>
    </div>
  )
}
