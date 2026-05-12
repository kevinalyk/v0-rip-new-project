"use client"

import { useEffect, useRef } from "react"

interface AdSidebarProps {
  showAd: boolean
}

/**
 * Renders a Google AdSense vertical sidebar ad on entity profile pages.
 * Only shown to unauthenticated visitors (showAd resolved server-side).
 */
export default function AdSidebar({ showAd }: AdSidebarProps) {
  const initialized = useRef(false)

  useEffect(() => {
    if (!showAd || initialized.current) return
    initialized.current = true
    try {
      ;(window as any).adsbygoogle = (window as any).adsbygoogle || []
      ;(window as any).adsbygoogle.push({})
    } catch {
      // AdSense not loaded — safe to ignore
    }
  }, [showAd])

  if (!showAd) return null

  return (
    <div
      className="hidden xl:flex flex-col items-center"
      style={{ width: "160px", minWidth: "160px", paddingTop: "24px" }}
      aria-label="Advertisement"
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot="5401962530"
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
