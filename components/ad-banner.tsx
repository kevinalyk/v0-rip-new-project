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
  const adRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!showAd) return
    if (adRef.current && adRef.current.getAttribute("data-adsbygoogle-status")) return
    try {
      ;(window as any).adsbygoogle = (window as any).adsbygoogle || []
      ;(window as any).adsbygoogle.push({})
    } catch {
      // AdSense not loaded yet — safe to ignore
    }
  }, [showAd])

  if (!showAd) return null

  return (
    <div className="w-full max-w-4xl mx-auto px-4 py-2" aria-label="Advertisement">
      <ins
        ref={(el) => { adRef.current = el }}
        className="adsbygoogle"
        style={{ display: "block", minHeight: "90px", maxHeight: "120px", overflow: "hidden" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot="7325494279"
        data-ad-format="horizontal"
      />
    </div>
  )
}
