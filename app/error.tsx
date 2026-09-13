"use client"

import { useEffect } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[v0] Unhandled application error:", error)
  }, [error])

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 text-center">
      <Image
        src="/images/IconOnly_Transparent_NoBuffer.png"
        alt=""
        width={56}
        height={56}
        className="mb-8 opacity-90"
      />
      <p className="text-sm font-semibold tracking-widest text-rip-red mb-3">ERROR</p>
      <h1 className="text-3xl font-bold tracking-tight mb-4 text-balance">Something went wrong</h1>
      <p className="text-muted-foreground leading-relaxed max-w-md mb-8 text-pretty">
        An unexpected error occurred while loading this page. You can try again, or head back to the homepage.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="branded" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="outline">
          <a href="/">Go to homepage</a>
        </Button>
      </div>
    </main>
  )
}
