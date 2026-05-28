"use client"

import { Suspense, useEffect, useState } from "react"
import { CIPricingContent } from "@/components/ci-pricing-content"
import { Loader2 } from "lucide-react"
import Image from "next/image"
import Link from "next/link"

export default function PublicBillingPage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [clientSlug, setClientSlug] = useState<string>("")

  useEffect(() => {
    fetch("/api/billing")
      .then((res) => {
        if (res.status === 401) {
          setIsAuthenticated(false)
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data) {
          setIsAuthenticated(true)
          setClientSlug(data.client?.slug || "")
        }
      })
      .catch(() => setIsAuthenticated(false))
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Minimal header */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative w-8 h-8">
              <Image
                src="/images/IconOnly_Transparent_NoBuffer.png"
                alt="Inbox.GOP"
                fill
                style={{ objectFit: "contain" }}
                priority
              />
            </div>
            <span className="font-bold text-base">Inbox.GOP</span>
          </Link>

          {/* Auth-aware nav — null while loading to avoid flash */}
          {isAuthenticated === true ? (
            <Link
              href={clientSlug ? `/${clientSlug}/ci/campaigns` : "/"}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Back to Feed
            </Link>
          ) : isAuthenticated === false ? (
            <div className="flex items-center gap-4">
              <Link
                href="/login"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="text-sm bg-[#dc2a28] hover:bg-[#dc2a28]/90 text-white px-3 py-1.5 rounded-md transition-colors"
              >
                Sign up
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <main>
        <Suspense
          fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          }
        >
          <CIPricingContent />
        </Suspense>
      </main>
    </div>
  )
}
