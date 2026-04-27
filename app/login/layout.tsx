import type { Metadata } from "next"

// Login is a public-facing page (so the redirect from "/" works and Google can
// crawl it to refresh the stale snippet), but it's not meaningful search-result
// content — tell Google not to index it.
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
