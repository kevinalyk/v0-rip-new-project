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
    <div className="w-full py-1" aria-label="Advertisement">
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
