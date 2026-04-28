import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cookies } from "next/headers"
import { CiDirectoryContent } from "@/components/ci-directory-content"
import AppLayout from "@/components/app-layout"
import { getAllEntitiesWithCounts } from "@/lib/ci-entity-utils"
import { verifyToken } from "@/lib/auth"
import {
  isStateSlug,
  isPartySlug,
  STATE_SLUG_TO_ABBREV,
  STATE_ABBREV_TO_NAME,
  PARTY_SLUG_TO_VALUE,
  PARTY_SLUG_TO_LABEL,
  PARTY_SLUG_TO_ADJECTIVE,
} from "@/lib/directory-routing"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

/**
 * State + party combo landing pages, e.g.:
 *   /directory/texas/republicans
 *   /directory/california/democrats
 *
 * The first slug must be a state, the second must be a party. Any other
 * combination returns a 404 so we don't accidentally render junk URLs that
 * Google might index.
 */

interface ResolvedCombo {
  stateAbbrev: string
  stateName: string
  stateSlug: string
  partyValue: string
  partySlug: string
  partyLabel: string
  partyAdjective: string
}

function resolveCombo(slug: string, secondSlug: string): ResolvedCombo | null {
  const lowerFirst = slug.toLowerCase()
  const lowerSecond = secondSlug.toLowerCase()

  if (isStateSlug(lowerFirst) && isPartySlug(lowerSecond)) {
    const stateAbbrev = STATE_SLUG_TO_ABBREV[lowerFirst]
    return {
      stateAbbrev,
      stateName: STATE_ABBREV_TO_NAME[stateAbbrev],
      stateSlug: lowerFirst,
      partyValue: PARTY_SLUG_TO_VALUE[lowerSecond],
      partySlug: lowerSecond,
      partyLabel: PARTY_SLUG_TO_LABEL[lowerSecond],
      partyAdjective: PARTY_SLUG_TO_ADJECTIVE[lowerSecond],
    }
  }
  return null
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; secondSlug: string }>
}): Promise<Metadata> {
  const { slug, secondSlug } = await params
  const combo = resolveCombo(slug, secondSlug)

  if (!combo) {
    return {
      title: "Page Not Found | RIP Directory",
      description: "This directory page could not be found.",
    }
  }

  const title = `${combo.stateName} ${combo.partyLabel} - Campaign Emails & SMS | RIP Directory`
  const description = `Track campaign emails and texts from ${combo.stateName} ${combo.partyAdjective} candidates and officials. See how ${combo.stateName} ${combo.partyLabel.toLowerCase()} are communicating with voters.`
  const url = `${APP_URL}/directory/${combo.stateSlug}/${combo.partySlug}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "RIP Tool",
      type: "website",
      images: [{ url: `${APP_URL}/og-image.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${APP_URL}/og-image.png`] },
    alternates: { canonical: url },
  }
}

async function getClientSlug(): Promise<string> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (token) {
      const payload = await verifyToken(token)
      if (payload) {
        return (payload.clientSlug as string) || ""
      }
    }
  } catch {
    // unauthenticated — fall through
  }
  return ""
}

export default async function DirectoryStatePartyPage({
  params,
}: {
  params: Promise<{ slug: string; secondSlug: string }>
}) {
  const { slug, secondSlug } = await params
  const combo = resolveCombo(slug, secondSlug)

  if (!combo) {
    notFound()
  }

  const clientSlug = await getClientSlug()
  const initialResult = await getAllEntitiesWithCounts({
    page: 1,
    pageSize: 50,
    state: combo.stateAbbrev,
    party: combo.partyValue,
  })

  const heading = `${combo.stateName} ${combo.partyLabel}`
  const subtitle = `Track ${combo.stateName} ${combo.partyAdjective} candidates, PACs, and officials. ${initialResult.pagination.totalCount} ${combo.partyAdjective} entities tracked in ${combo.stateName}.`

  const url = `${APP_URL}/directory/${combo.stateSlug}/${combo.partySlug}`
  const collectionPage = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: heading,
    description: subtitle,
    url,
    isPartOf: { "@type": "WebSite", name: "RIP Tool", url: APP_URL },
  }

  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Directory", item: `${APP_URL}/directory` },
      { "@type": "ListItem", position: 2, name: combo.stateName, item: `${APP_URL}/directory/${combo.stateSlug}` },
      { "@type": "ListItem", position: 3, name: combo.partyLabel, item: url },
    ],
  }

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionPage) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
        <CiDirectoryContent
          clientSlug={clientSlug}
          isPublic={!clientSlug}
          initialEntities={initialResult.entities}
          initialPagination={initialResult.pagination}
          initialState={combo.stateAbbrev}
          initialParty={combo.partyValue}
          pageHeading={heading}
          pageSubtitle={subtitle}
          syncUrlWithFilters
        />
      </AppLayout>
    </>
  )
}
