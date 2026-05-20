"use client"

import { useEffect, useRef } from "react"

interface AdBannerProps {
  showAd: boolean
}

export default function AdBanner({ showAd }: AdBannerProps) {
  const pushed = useRef(false)

  useEffect(() => {
    if (!showAd || pushed.current) return
    try {
      pushed.current = true
      ;((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({})
    } catch {
      // safe to ignore
    }
  }, [showAd])

  if (!showAd) return null

  return (
    <div className="w-full flex justify-center py-1" style={{ minHeight: "92px" }} aria-label="Advertisement">
      <ins
        className="adsbygoogle"
        style={{ display: "inline-block", width: "728px", height: "90px" }}
        data-ad-client="ca-pub-5715074898343065"
        data-ad-slot="7325494279"
        data-ad-format="horizontal"
        data-full-width-responsive="false"
      />
    </div>
  )
}
