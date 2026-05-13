"use client"

import { useEffect, useRef } from "react"

interface AdBannerProps {
  showAd: boolean
}

/**
 * Renders a Google AdSense top banner when showAd is true.
 * showAd is resolved server-side: true for unauthenticated visitors and free-plan users.
 */
export default function AdBanner({ showAd }: AdBannerProps) {
  const pushed = useRef(false)

  useEffect(() => {
    if (!showAd || pushed.current) return

    function tryPush() {
      if (pushed.current) return
      try {
        const ads = (window as any).adsbygoogle
        if (!ads || typeof ads.push !== "function") {
          setTimeout(tryPush, 200)
          return
        }
        pushed.current = true
        ads.push({})
      } catch {
        // safe to ignore
      }
    }

    tryPush()
  }, [showAd])

  if (!showAd) return null

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-2" aria-label="Advertisement">
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: "90px", maxHeight: "120px", overflow: "hidden" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot="7325494279"
        data-ad-format="horizontal"
      />
    </div>
  )
}
