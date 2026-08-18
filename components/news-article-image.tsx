"use client"

import { useState } from "react"

interface NewsArticleImageProps {
  src: string
  alt: string
  /** Classes for the fixed-size clipping container (controls the banner's footprint on the page). */
  containerClassName: string
}

/**
 * Renders an announcement banner image inside a fixed-size container.
 *
 * Wide/landscape images (e.g. designed 16:6 banners) are cropped to fill the
 * container exactly like before. Tall images (e.g. product screenshots or
 * portrait mockups) would lose their top/bottom content if cropped the same
 * way, so those are instead scaled to fit fully inside the container with
 * letterboxing. The decision is made from the image's real dimensions once
 * it loads, so existing wide banners keep their current look untouched.
 */
export function NewsArticleImage({ src, alt, containerClassName }: NewsArticleImageProps) {
  const [isTall, setIsTall] = useState(false)

  return (
    <div className={containerClassName}>
      <img
        src={src}
        alt={alt}
        className={isTall ? "w-full h-full object-contain" : "w-full h-full object-cover"}
        crossOrigin="anonymous"
        onLoad={(e) => {
          const img = e.currentTarget
          if (img.naturalWidth && img.naturalHeight) {
            setIsTall(img.naturalHeight / img.naturalWidth > 0.7)
          }
        }}
      />
    </div>
  )
}
