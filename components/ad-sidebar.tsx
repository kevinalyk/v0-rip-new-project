"use client"

import { useEffect, useRef } from "react"

interface AdSidebarProps {
  showAd: boolean
  slot?: string
}

/**
 * Renders a Google AdSense vertical sidebar ad.
 * slot defaults to "5401962530" (RIP Tool - Vertical).
 * Pass slot="9922824720" for the "RIP Tool - Other Side Bar".
 */
export default function AdSidebar({ showAd, slot = "5401962530" }: AdSidebarProps) {
  const pushed = useRef(false)

  useEffect(() => {
    if (!showAd || pushed.current) return

    function tryPush() {
      if (pushed.current) return
      try {
        const adsbyg = (window as any).adsbygoogle
        // Wait until the real AdSense library has loaded (it sets .loaded = true)
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

    // Give the script a moment to initialise before first attempt
    setTimeout(tryPush, 100)
  }, [showAd])

  if (!showAd) return null

  return (
    <div
      className="hidden lg:flex flex-col items-start flex-shrink-0"
      style={{ width: "160px", minWidth: "160px", paddingTop: "24px" }}
      aria-label="Advertisement"
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
