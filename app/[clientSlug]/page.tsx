"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"

export default function ClientPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  useEffect(() => {
    if (searchParams.get("success") === "true") {
      setShowSuccessMessage(true)
      // Clear the success parameter and redirect after showing message
      setTimeout(() => {
        setShowSuccessMessage(false)
        router.replace(`/${params.clientSlug}/ci/campaigns`)
      }, 2000)
      return
    }

    const checkAccessAndRedirect = async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        })

        if (!response.ok) {
          router.push("/login")
          return
        }

        const user = await response.json()

        if (user.firstLogin) {
          router.push(`/reset-password?email=${encodeURIComponent(user.email)}`)
          return
        }

        // Verify access to this client slug
        const accessResponse = await fetch(`/api/client/verify-access?slug=${params.clientSlug}`, {
          credentials: "include",
        })

        if (!accessResponse.ok) {
          // User doesn't have access to this client
          if (user.role === "super_admin") {
            router.push("/admin/tools")
          } else {
            // Redirect to their own client
            const clientResponse = await fetch("/api/client/slug", {
              credentials: "include",
            })

            if (clientResponse.ok) {
              const { slug } = await clientResponse.json()
              router.push(`/${slug}/ci/campaigns`)
            } else {
              router.push("/login")
            }
          }
          return
        }

        router.push(`/${params.clientSlug}/ci/campaigns`)
      } catch (error) {
        console.error("Access check error:", error)
        router.push("/login")
      }
    }

    checkAccessAndRedirect()
  }, [params.clientSlug, router, searchParams])

  return (
    <div className="min-h-screen flex items-center justify-center">
      {showSuccessMessage && (
        <div className="fixed top-4 right-4 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-lg">
          Payment successful! Your subscription has been updated.
        </div>
      )}
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#dc2a28]"></div>
    </div>
  )
}
