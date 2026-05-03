import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import Image from "next/image"
import { verifyToken } from "@/lib/auth"
import AppLayout from "@/components/app-layout"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft, ArrowRight, Sparkles, Megaphone, MapPin, Building2 } from "lucide-react"
import prisma from "@/lib/prisma"
import { nameToSlug } from "@/lib/directory"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

const NC_TITLE = "Recently Launched Campaigns | RIP Tool"
const NC_DESCRIPTION =
  "Track political campaigns launched in the last 7 days. New House, Senate, and other federal candidates from across the United States, captured by the Republican Inboxing Protocol."

export const metadata: Metadata = {
  title: NC_TITLE,
  description: NC_DESCRIPTION,
  openGraph: {
    title: NC_TITLE,
    description: NC_DESCRIPTION,
    url: `${APP_URL}/directory/new-campaigns`,
    siteName: "RIP Tool",
    type: "website",
    images: [{ url: `${APP_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: NC_TITLE }],
  },
  twitter: {
    card: "summary_large_image",
    title: NC_TITLE,
    description: NC_DESCRIPTION,
    images: [`${APP_URL}/og-candidate-directory.png`],
  },
  alternates: { canonical: `${APP_URL}/directory/new-campaigns` },
}

// ISR — revalidate every hour so the page stays fresh without a full server render on every hit
export const revalidate = 3600

function partyColor(party: string | null) {
  if (!party) return "bg-muted text-muted-foreground"
  const p = party.toLowerCase()
  if (p === "republican") return "bg-red-600/20 text-red-400 border-red-600/30"
  if (p === "democrat") return "bg-blue-600/20 text-blue-400 border-blue-600/30"
  if (p === "independent") return "bg-amber-600/20 text-amber-400 border-amber-600/30"
  return "bg-muted text-muted-foreground"
}

function formatPartyLabel(party: string | null) {
  if (!party) return null
  return party.charAt(0).toUpperCase() + party.slice(1)
}

function formatRelativeDate(date: Date | null): string {
  if (!date) return "Recently"
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  return `${diffDays} days ago`
}

export default async function NewCampaignsPage() {
  // Resolve clientSlug server-side so sidebar renders correctly for authenticated users
  let clientSlug = ""
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (token) {
      const payload = await verifyToken(token)
      if (payload) clientSlug = (payload.clientSlug as string) || ""
    }
  } catch {
    // unauthenticated visitor — no-op
  }

  // Fetch launches from the last 7 days, newest first, with linked entity data.
  // Note: we filter and sort by `launchedAt` (the actual FEC filing date shown to users),
  // not `firstSeenAt` (when our scraper picked them up). All rows in a single scrape
  // batch share the same firstSeenAt, which is why sorting on it produced a scrambled
  // order. We fall back to firstSeenAt only when launchedAt is missing.
  const since = new Date()
  since.setDate(since.getDate() - 7)

  const launches = await prisma.campaignLaunch.findMany({
    where: {
      status: "active",
      OR: [
        { launchedAt: { gte: since } },
        { AND: [{ launchedAt: null }, { firstSeenAt: { gte: since } }] },
      ],
    },
    orderBy: [{ launchedAt: "desc" }, { firstSeenAt: "desc" }],
    include: {
      linkedEntity: {
        select: {
          id: true,
          name: true,
          imageUrl: true,
          bio: true,
          office: true,
          party: true,
          state: true,
        },
      },
    },
  })

  const isEmpty = launches.length === 0

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <div className="flex flex-col h-full min-h-screen bg-background">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 px-4 md:px-6 pt-4 md:pt-6 pb-4 border-b border-border">
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
            <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">
              Federal campaigns filed with the FEC in the last 7 days, sorted most recent first.
              Profiles are enriched over time as more information becomes available.
            </p>
          </div>
          {!isEmpty && (
            <div className="flex-shrink-0 text-sm text-muted-foreground pt-1">
              {launches.length} new {launches.length === 1 ? "campaign" : "campaigns"} this week
            </div>
          )}
        </div>

        <div className="flex-1 px-4 md:px-6 py-6">
          {isEmpty ? (
            /* Empty state */
            <div className="flex items-center justify-center py-24">
              <Card className="max-w-xl w-full border-border/60">
                <CardContent className="flex flex-col items-center gap-4 py-12 px-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EB3847]/10 border border-[#EB3847]/30">
                    <Megaphone className="h-6 w-6 text-[#EB3847]" />
                  </div>
                  <h2 className="text-lg font-semibold">No new launches this week</h2>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    No federal campaign filings were detected in the last 7 days. The FEC scraper
                    runs daily at 6am UTC — check back tomorrow for the latest filings.
                  </p>
                  <Link
                    href="/directory"
                    className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-[#EB3847] hover:text-[#EB3847]/80 transition-colors"
                  >
                    Browse the full directory
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* Launch cards grid */
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {launches.map((launch) => {
                const entity = launch.linkedEntity
                const slug = entity ? nameToSlug(entity.name) : null
                const profileUrl = slug ? `/directory/${slug}` : null
                const imageUrl = entity?.imageUrl || null
                const bio = entity?.bio || null
                const office = launch.office || entity?.office || null
                const party = launch.party || entity?.party || null
                // FEC sets state="US" for presidential candidates — hide the badge in that case
                // since "US" isn't meaningful as a state for display.
                const rawState = launch.state || entity?.state || null
                const state = rawState && rawState !== "US" ? rawState : null
                const name = launch.name

                const cardContent = (
                  <Card className={`h-full border-border/60 transition-all ${profileUrl ? "hover:border-foreground/30 hover:bg-accent/20 cursor-pointer" : ""}`}>
                    <CardContent className="p-4 flex flex-col gap-3 h-full">
                      {/* Top row: photo + name */}
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 h-12 w-12 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border/60">
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt={name}
                              width={48}
                              height={48}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            <span className="text-lg font-semibold text-muted-foreground">
                              {name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm leading-tight truncate">{name}</p>
                          {office && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-snug">{office}</p>
                          )}
                        </div>
                      </div>

                      {/* Badges row */}
                      <div className="flex flex-wrap gap-1.5">
                        {party && (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${partyColor(party)}`}>
                            {formatPartyLabel(party)}
                          </span>
                        )}
                        {state && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground border border-border/60">
                            <MapPin className="h-2.5 w-2.5" />
                            {state}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground border border-border/60">
                          <Building2 className="h-2.5 w-2.5" />
                          FEC
                        </span>
                      </div>

                      {/* Bio snippet */}
                      {bio && (
                        <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed flex-1">
                          {bio}
                        </p>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between mt-auto pt-1">
                        <span className="text-xs text-muted-foreground">
                          {formatRelativeDate(launch.launchedAt || launch.firstSeenAt)}
                        </span>
                        {profileUrl ? (
                          <span className="inline-flex items-center gap-1 text-xs text-[#EB3847]">
                            View profile
                            <ArrowRight className="h-3 w-3" />
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Profile pending</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )

                return profileUrl ? (
                  <Link key={launch.id} href={profileUrl}>
                    {cardContent}
                  </Link>
                ) : (
                  <div key={launch.id}>{cardContent}</div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
