interface NewsArticleImageProps {
  src: string
  alt: string
  /**
   * Classes for the outer wrapper. Should NOT set a fixed height or
   * `overflow-hidden` — the image renders at its natural aspect ratio, so
   * the wrapper's height follows the image automatically. Width/rounding/
   * background classes are still fine to pass here.
   */
  containerClassName?: string
}

/**
 * Renders an announcement banner image without ever cropping it.
 *
 * Earlier versions of this component tried to force every image into a
 * fixed-aspect-ratio box (via `object-cover`, or a heuristic that guessed
 * whether to crop vs. letterbox). Both approaches cut off real content for
 * some images (e.g. a headline running along the top edge) because the
 * guess didn't match the image's actual composition.
 *
 * The reliable fix is to not crop at all: the image is rendered at
 * `w-full h-auto`, so it always displays in full at its natural aspect
 * ratio, and the container height simply follows the image instead of the
 * other way around.
 */
export function NewsArticleImage({ src, alt, containerClassName }: NewsArticleImageProps) {
  return (
    <div className={containerClassName}>
      <img src={src} alt={alt} className="w-full h-auto block" />
    </div>
  )
}
