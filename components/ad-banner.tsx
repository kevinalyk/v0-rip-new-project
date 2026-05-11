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
  const initialized = useRef(false)

  useEffect(() => {
    if (!showAd || initialized.current) return
    initialized.current = true
    try {
      // Push the ad unit after the component mounts
      ;(window as any).adsbygoogle = (window as any).adsbygoogle || []
      ;(window as any).adsbygoogle.push({})
    } catch (e) {
      // AdSense not loaded yet — safe to ignore
    }
  }, [showAd])

  if (!showAd) return null

  return (
    <div className="w-full" aria-label="Advertisement">
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
