import type { Metadata } from "next"
import { cookies } from "next/headers"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import { CiDirectoryContent } from "@/components/ci-directory-content"
import { getAllEntitiesWithCounts } from "@/lib/ci-entity-utils"
import AdBanner from "@/components/ad-banner"
import { shouldShowAd } from "@/lib/ads"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export const metadata: Metadata = {
  title: "Political Campaign Directory - Inbox.GOP",
  description: "Browse campaign emails and texts from thousands of political candidates, PACs, and advocacy groups across the United States. Track political messaging with Inbox.GOP.",
  keywords: [
    "political campaign directory",
    "republican candidates emails",
    "PAC fundraising texts",
    "political messaging database",
    "campaign email tracker",
    "GOP candidate directory",
    "political organization contacts",
    "inbox gop directory",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: `${APP_URL}/directory` },
  openGraph: {
    title: "Political Campaign Directory - Inbox.GOP",
    description: "Browse campaign emails and texts from thousands of political candidates, PACs, and advocacy groups across the United States.",
    url: `${APP_URL}/directory`,
    siteName: "Inbox.GOP",
    type: "website",
    images: [{ url: `${APP_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: "Inbox.GOP Political Directory" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Political Campaign Directory - Inbox.GOP",
    description: "Browse campaign emails and texts from thousands of political candidates, PACs, and advocacy groups.",
    images: [`${APP_URL}/og-candidate-directory.png`],
  },
}

export default async function PublicDirectoryPage() {
  // Resolve clientSlug server-side so the page ships with pre-rendered HTML
  // that bots and AI agents can read. Unauthenticated visitors get an empty
  // string, which CiDirectoryContent already handles gracefully.
  let clientSlug = ""

  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (token) {
      const payload = await verifyToken(token)
      if (payload) {
        clientSlug = (payload.clientSlug as string) || ""
      }
    }
  } catch {
    // unauthenticated visitor — no-op
  }

  const [showAd, initialResult] = await Promise.all([
    shouldShowAd(),
    getAllEntitiesWithCounts({ page: 1, pageSize: 50 }),
  ])

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <AdBanner showAd={showAd} />
      <CiDirectoryContent
        clientSlug={clientSlug}
        isPublic={!clientSlug}
        initialEntities={initialResult.entities}
        initialPagination={initialResult.pagination}
        syncUrlWithFilters
      />
    </AppLayout>
  )
}
