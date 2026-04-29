import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, Sparkles, Megaphone } from "lucide-react"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export const metadata: Metadata = {
  title: "Recently Launched Campaigns | RIP Directory",
  description:
    "Track political campaigns launched in the last 7 days. New House, Senate, gubernatorial, and other political candidates from across the United States.",
  openGraph: {
    title: "Recently Launched Campaigns | RIP Directory",
    description:
      "Track political campaigns launched in the last 7 days. New House, Senate, gubernatorial, and other political candidates from across the United States.",
    url: `${APP_URL}/directory/new-campaigns`,
    siteName: "RIP Tool",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Recently Launched Campaigns | RIP Directory",
    description:
      "Track political campaigns launched in the last 7 days. New House, Senate, gubernatorial, and other political candidates from across the United States.",
  },
  alternates: { canonical: `${APP_URL}/directory/new-campaigns` },
}

export default async function NewCampaignsPage() {
  // Resolve clientSlug server-side so the persistent sidebar lights up the
  // correct client on first paint, just like the main public directory does.
  // Unauthenticated visitors fall through with an empty slug and still see
  // the page (it's intentionally public for SEO) — the sidebar will simply
  // render its "logged out" variant.
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

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <div className="flex flex-col h-full min-h-screen bg-background">
        {/* Page header — mirrors the directory header so navigation feels continuous */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 md:px-6 pt-4 md:pt-6 pb-4 border-b border-border">
          <div className="min-w-0">
            <Link
              href="/directory"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Directory
            </Link>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#EB3847]" />
              Recently Launched Campaigns
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5 max-w-4xl">
              Political campaigns launched in the last 7 days, sorted from most to least recent. Each
              card highlights what we know about the candidate, what they&apos;re running for, their party,
              and their state.
            </p>
          </div>
        </div>

        {/* Coming soon placeholder — Phase 2 will replace this with a card grid
            populated from the dedicated launches table (FEC + scraped sources). */}
        <div className="flex-1 flex items-center justify-center px-4 md:px-6 py-12">
          <Card className="max-w-xl w-full border-border/60">
            <CardContent className="flex flex-col items-center gap-4 py-12 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EB3847]/10 border border-[#EB3847]/30">
                <Megaphone className="h-6 w-6 text-[#EB3847]" />
              </div>
              <h2 className="text-lg font-semibold">Coming Soon</h2>
              <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                We&apos;re wiring up automated tracking of newly-announced political campaigns. Once it
                ships, this page will surface every fresh launch from the past week with all the
                details we can pull — name, office, party, state, district, and a link to their
                profile when available.
              </p>
              <Link
                href="/directory"
                className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-[#EB3847] hover:text-[#EB3847]/80 transition-colors"
              >
                Browse the full directory instead
                <ArrowLeft className="h-4 w-4 rotate-180" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
