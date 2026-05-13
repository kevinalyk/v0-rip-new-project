"use client"

import { useEffect, useRef } from "react"

interface AdBannerProps {
  showAd: boolean
}

/**
 * Renders a Google AdSense banner ad (RIP Tool - Banner, slot 7325494279).
 * showAd is resolved server-side: true for unauthenticated / free-plan users.
 */
export default function AdBanner({ showAd }: AdBannerProps) {
  const pushed = useRef(false)

  useEffect(() => {
    if (!showAd || pushed.current) return

    function tryPush() {
      if (pushed.current) return
      try {
        const adsbyg = (window as any).adsbygoogle
        if (!adsbyg || !adsbyg.loaded) {
          setTimeout(tryPush, 300)
          return
        }
        pushed.current = true
        adsbyg.push({})
      } catch {
        // safe to ignore
      }
    }

    setTimeout(tryPush, 100)
  }, [showAd])

  if (!showAd) return null

  return (
    <div className="w-full py-2" aria-label="Advertisement">
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot="7325494279"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
