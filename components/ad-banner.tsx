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
    console.log("[v0] AdBanner mounted, showAd=", showAd)
    if (!showAd || pushed.current) {
      console.log("[v0] AdBanner returning early: showAd=", showAd, "pushed=", pushed.current)
      return
    }

    function tryPush() {
      if (pushed.current) return
      try {
        const adsbyg = (window as any).adsbygoogle
        console.log("[v0] AdBanner tryPush: adsbyg=", !!adsbyg, "loaded=", adsbyg?.loaded)
        if (!adsbyg || !adsbyg.loaded) {
          console.log("[v0] AdBanner AdSense not ready, retrying")
          setTimeout(tryPush, 300)
          return
        }
        pushed.current = true
        console.log("[v0] AdBanner pushing ad for slot 7325494279")
        adsbyg.push({})
      } catch (e) {
        console.error("[v0] AdBanner error:", e)
      }
    }

    console.log("[v0] AdBanner scheduling first tryPush")
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
