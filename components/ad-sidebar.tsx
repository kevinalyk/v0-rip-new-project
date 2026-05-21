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
    try {
      pushed.current = true
      ;((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({})
    } catch {
      // safe to ignore
    }
  }, [showAd, slot])

  if (!showAd) return null

  return (
    <div
      className="hidden md:block flex-shrink-0 self-center"
      style={{ width: "120px", minWidth: "120px", minHeight: "600px" }}
      aria-label="Advertisement"
    >
      <ins
        className="adsbygoogle"
        style={{ display: "inline-block", width: "120px", height: "600px" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot={slot}
        data-ad-format="vertical"
        data-full-width-responsive="false"
      />
    </div>
  )
}
