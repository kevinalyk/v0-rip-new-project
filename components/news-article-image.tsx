"use client"

import { useRef, useState } from "react"

interface NewsArticleImageProps {
  src: string
  alt: string
  /** Classes for the fixed-size clipping container (controls the banner's footprint on the page). */
  containerClassName: string
}

/**
 * Renders an announcement banner image inside a fixed-size container.
 *
 * Images whose aspect ratio closely matches the container (e.g. banners
 * designed for that exact footprint) are cropped to fill it exactly like
 * before. Images that are proportionally narrower/taller than the container
 * (e.g. product screenshots or portrait mockups) would lose meaningful
 * top/bottom content if cropped the same way, so those are instead scaled to
 * fit fully inside the container with letterboxing.
 *
 * The decision compares the image's real aspect ratio against the
 * container's actual rendered aspect ratio (not a fixed constant), since the
 * container shape differs between the news list cards and the article detail
 * banner.
 */
export function NewsArticleImage({ src, alt, containerClassName }: NewsArticleImageProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState<"cover" | "contain">("cover")

  return (
    <div ref={containerRef} className={containerClassName}>
      <img
        src={src}
        alt={alt}
        className={fit === "contain" ? "w-full h-full object-contain" : "w-full h-full object-cover"}
        onLoad={(e) => {
          const img = e.currentTarget
          const container = containerRef.current
          if (!img.naturalWidth || !img.naturalHeight || !container) return

          const imageAspect = img.naturalWidth / img.naturalHeight
          const containerAspect = container.clientWidth / container.clientHeight

          // If the image is meaningfully narrower (more portrait) than the
          // container, cropping to fill would cut off real content -
          // letterbox it instead. A small tolerance avoids flipping modes
          // for banners that are already a near-exact match.
          setFit(imageAspect < containerAspect * 0.9 ? "contain" : "cover")
        }}
      />
    </div>
  )
}
