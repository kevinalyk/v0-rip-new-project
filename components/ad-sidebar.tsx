"use client"

import { useEffect, useRef } from "react"

interface AdSidebarProps {
  showAd: boolean
  slot?: string
}

export default function AdSidebar({ showAd, slot = "5401962530" }: AdSidebarProps) {
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
  }, [showAd, slot])

  if (!showAd) return null

  return (
    <div
      className="flex-shrink-0 overflow-hidden"
      style={{ width: "120px", minWidth: "120px" }}
      aria-label="Advertisement"
    >
      <ins
        className="adsbygoogle"
        style={{ display: "block", width: "120px" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
