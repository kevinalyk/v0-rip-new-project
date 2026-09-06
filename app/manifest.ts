import type { MetadataRoute } from "next"

// NOTE: app/icon.png and app/apple-icon.png are currently 1280x1662 (non-square),
// so they are intentionally NOT listed as manifest icons here — a non-square icon
// breaks "Add to Home Screen" on iOS/Android. Real 192x192 and 512x512 square PNGs
// need to be produced from source art as a follow-up; once available, add an
// `icons` array pointing at them. See docs/mobile-api.md.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inbox.GOP",
    short_name: "Inbox.GOP",
    description:
      "A tool dedicated to helping Republicans and conservatives inbox effectively.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#eb3847",
  }
}
