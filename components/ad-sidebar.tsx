"use client"

import { useEffect, useRef } from "react"

interface AdSidebarProps {
  showAd: boolean
  slot?: string
}

/**
 * Renders a Google AdSense vertical sidebar ad on entity profile pages.
 * Only shown to unauthenticated visitors (showAd resolved server-side).
 */
export default function AdSidebar({ showAd, slot = "5401962530" }: AdSidebarProps) {
  const pushed = useRef(false)

  useEffect(() => {
    if (!showAd || pushed.current) return

    function tryPush() {
      if (pushed.current) return
      try {
        const ads = (window as any).adsbygoogle
        // Ensure the script has loaded and initialised its array
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
    <div
      className="hidden lg:flex flex-col items-start flex-shrink-0"
      style={{ width: "160px", minWidth: "160px", paddingTop: "24px" }}
      aria-label="Advertisement"
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "160px", minHeight: "600px" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="false"
      />
    </div>
  )
}
