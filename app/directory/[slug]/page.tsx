import type { Metadata } from "next"
import { cookies } from "next/headers"
import { DirectoryProfileContent } from "@/components/directory-profile-content"
import { CiDirectoryContent } from "@/components/ci-directory-content"
import AppLayout from "@/components/app-layout"
import { getEntityBySlug } from "@/lib/directory"
import { getAllEntitiesWithCounts } from "@/lib/ci-entity-utils"
import { verifyToken } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  resolveSlug,
  PARTY_SLUG_TO_LABEL,
  PARTY_SLUG_TO_ADJECTIVE,
} from "@/lib/directory-routing"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

// ──────────────────────────────────────────────────────────────────────────────
// Metadata builders
// ──────────────────────────────────────────────────────────────────────────────

function buildStateMetadata(stateName: string, slug: string): Metadata {
  const title = `${stateName} Political Email & SMS Communications | RIP Tool`
  const description = `See campaign emails and texts from ${stateName} candidates, PACs, and political organizations. Track political messaging across ${stateName} with the Republican Inboxing Protocol.`
  const url = `${APP_URL}/directory/${slug}`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "RIP Tool",
      type: "website",
      images: [{ url: `${APP_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${APP_URL}/og-candidate-directory.png`] },
    alternates: { canonical: url },
  }
}

function buildPartyMetadata(partySlug: string, partyLabel: string): Metadata {
  const title = `${partyLabel} - Campaign Emails & SMS Communications | RIP Tool`
  const description = `Track ${partyLabel.toLowerCase()}' campaign emails, fundraising texts, and political messaging. See how ${partyLabel.toLowerCase()} are reaching voters via the Republican Inboxing Protocol.`
  const url = `${APP_URL}/directory/${partySlug}`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "RIP Tool",
      type: "website",
      images: [{ url: `${APP_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${APP_URL}/og-candidate-directory.png`] },
    alternates: { canonical: url },
  }
}

function buildEntityMetadata(data: NonNullable<Awaited<ReturnType<typeof getEntityBySlug>>>, slug: string): Metadata {
  const { entity } = data
  const partyLabel = entity.party ? ` · ${entity.party.charAt(0).toUpperCase() + entity.party.slice(1)}` : ""
  const stateLabel = entity.state ? ` · ${entity.state}` : ""
  const title = `${entity.name}${partyLabel}${stateLabel} | RIP Tool`

  let description: string
  if (entity.type === "candidate" || entity.type === "politician") {
    description = `See ${entity.name}'s campaign emails and texts. Track ${entity.type === "candidate" ? "their" : "his/her"} inbox strategy and communications. ${entity.counts.total} messages captured.`
  } else if (entity.type === "pac") {
    description = `View ${entity.name}'s fundraising emails and SMS campaigns. See how this PAC is communicating with supporters. ${entity.counts.total} messages tracked.`
  } else {
    description = entity.description
      ? entity.description
      : `Track ${entity.name}'s email and SMS communications. ${entity.counts.total} total messages captured.`
  }

  const isPublicBlobUrl = (url: string | null) =>
    !!url && url.includes("public.blob.vercel-storage.com")

  const ogImage = isPublicBlobUrl(entity.imageUrl)
    ? { url: entity.imageUrl as string, width: 400, height: 500, alt: entity.name }
    : { url: `${APP_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: "RIP Tool" }

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/directory/${slug}`,
      siteName: "RIP Tool",
      type: "profile",
      images: [ogImage],
    },
    twitter: {
      card: isPublicBlobUrl(entity.imageUrl) ? "summary" : "summary_large_image",
      title,
      description,
      images: [ogImage.url],
    },
    alternates: {
      canonical: `${APP_URL}/directory/${slug}`,
    },
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params

  // Check landing page slugs first (state/party) — these take precedence over
  // entities since they're a small fixed set we control.
  const resolved = resolveSlug(slug)
  if (resolved?.kind === "state") {
    return buildStateMetadata(resolved.name, slug)
  }
  if (resolved?.kind === "party") {
    return buildPartyMetadata(resolved.slug, PARTY_SLUG_TO_LABEL[resolved.slug])
  }

  // Otherwise treat as an entity profile
  const data = await getEntityBySlug(slug)
  if (!data) {
    return {
      title: "Entity Not Found | RIP Tool",
      description: "This entity could not be found in the RIP Tool directory.",
    }
  }
  return buildEntityMetadata(data, slug)
}

// ──────────────────────────────────────────────────────────────────────────────
// Structured data (JSON-LD)
// ──────────────────────────────────────────────────────────────────────────────

function buildEntityStructuredData(data: NonNullable<Awaited<ReturnType<typeof getEntityBySlug>>>) {
  const { entity } = data
  const url = `${APP_URL}/directory/${entity.slug}`
  const isPerson = entity.type === "candidate" || entity.type === "politician"

  const sameAs: string[] = []
  if (entity.ballotpediaUrl) sameAs.push(entity.ballotpediaUrl)
  const winredSlugs = entity.donationIdentifiers?.winred ?? []
  for (const winredSlug of winredSlugs) {
    sameAs.push(`https://secure.winred.com/${winredSlug}`)
  }

  const partyLabel = entity.party
    ? entity.party.charAt(0).toUpperCase() + entity.party.slice(1) + " Party"
    : undefined

  const description =
    entity.bio ||
    entity.description ||
    `${entity.name}${entity.office ? `, ${entity.office}` : ""}${entity.state ? ` (${entity.state})` : ""}. Email and SMS communications tracked by the Republican Inboxing Protocol.`

  if (isPerson) {
    return {
      "@context": "https://schema.org",
      "@type": "Person",
      "@id": url,
      name: entity.name,
      description,
      url,
      ...(entity.imageUrl ? { image: entity.imageUrl } : {}),
      ...(entity.office ? { jobTitle: entity.office } : {}),
      ...(partyLabel ? { affiliation: { "@type": "Organization", name: partyLabel } } : {}),
      ...(entity.state
        ? { homeLocation: { "@type": "AdministrativeArea", name: entity.state } }
        : {}),
      ...(sameAs.length > 0 ? { sameAs } : {}),
    }
  }

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": url,
    name: entity.name,
    description,
    url,
    ...(entity.imageUrl ? { logo: entity.imageUrl, image: entity.imageUrl } : {}),
    ...(partyLabel ? { memberOf: { "@type": "Organization", name: partyLabel } } : {}),
    ...(entity.state
      ? { areaServed: { "@type": "AdministrativeArea", name: entity.state } }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }
}

function buildEntityBreadcrumb(entityName: string, slug: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Directory", item: `${APP_URL}/directory` },
      { "@type": "ListItem", position: 2, name: entityName, item: `${APP_URL}/directory/${slug}` },
    ],
  }
}

function buildLandingBreadcrumb(label: string, slug: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Directory", item: `${APP_URL}/directory` },
      { "@type": "ListItem", position: 2, name: label, item: `${APP_URL}/directory/${slug}` },
    ],
  }
}

function buildLandingCollectionPage(name: string, description: string, slug: string) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${APP_URL}/directory/${slug}`,
    isPartOf: {
      "@type": "WebSite",
      name: "RIP Tool",
      url: APP_URL,
    },
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Auth helper (shared with /directory/page.tsx)
// ──────────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────────
// Page component
// ──────────────────────────────────────────────────────────────────────────────

export default async function DirectorySlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const resolved = resolveSlug(slug)

  // ─── State landing page (e.g. /directory/texas) ───
  if (resolved?.kind === "state") {
    const clientSlug = await getClientSlug()
    const initialResult = await getAllEntitiesWithCounts({
      page: 1,
      pageSize: 50,
      state: resolved.abbrev,
    })
    const heading = `Political Communications in ${resolved.name}`
    const subtitle = `Browse campaign emails, fundraising texts, and political messaging from ${resolved.name} candidates, PACs, and organizations. ${initialResult.pagination.totalCount} ${resolved.name} entities tracked.`
    const collectionPage = buildLandingCollectionPage(heading, subtitle, slug)
    const breadcrumb = buildLandingBreadcrumb(resolved.name, slug)

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
            initialState={resolved.abbrev}
            pageHeading={heading}
            pageSubtitle={subtitle}
            syncUrlWithFilters
          />
        </AppLayout>
      </>
    )
  }

  // ─── Party landing page (e.g. /directory/republicans) ───
  if (resolved?.kind === "party") {
    const clientSlug = await getClientSlug()
    const initialResult = await getAllEntitiesWithCounts({
      page: 1,
      pageSize: 50,
      party: resolved.value,
    })
    const adjective = PARTY_SLUG_TO_ADJECTIVE[resolved.slug]
    const label = PARTY_SLUG_TO_LABEL[resolved.slug]
    const heading = `${label} - Campaign Emails & SMS`
    const subtitle = `Track ${adjective} candidates, PACs, and organizations. See campaign emails, fundraising texts, and political messaging from ${initialResult.pagination.totalCount} ${adjective} entities.`
    const collectionPage = buildLandingCollectionPage(heading, subtitle, slug)
    const breadcrumb = buildLandingBreadcrumb(label, slug)

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
            initialParty={resolved.value}
            pageHeading={heading}
            pageSubtitle={subtitle}
            syncUrlWithFilters
          />
        </AppLayout>
      </>
    )
  }

  // ─── Entity profile page (existing flow) ───
  // Resolve full CI access here in the server page (which already imports
  // next/headers) so lib/directory.ts stays free of that dependency and can
  // be safely imported by client-side code without breaking the build.
  const cookieStore = await cookies()
  const authToken = cookieStore.get("auth_token")?.value
  let hasFullAccess = false
  if (authToken) {
    try {
      const payload = await verifyToken(authToken)
      if (payload) {
        const user = await prisma.user.findUnique({
          where: { id: payload.userId as string },
          select: { role: true, client: { select: { ciSubscriptionPlan: true } } },
        })
        if (user) {
          hasFullAccess =
            user.role === "super_admin" ||
            (user.client?.ciSubscriptionPlan ?? "none") !== "none"
        }
      }
    } catch {
      // invalid token — treat as unauthenticated
    }
  }
  const initialData = await getEntityBySlug(slug, hasFullAccess)
  const structuredData = initialData ? buildEntityStructuredData(initialData) : null
  const breadcrumbData = initialData ? buildEntityBreadcrumb(initialData.entity.name, slug) : null

  return (
    <>
      {structuredData && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      )}
      {breadcrumbData && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }} />
      )}
      <DirectoryProfileContent slug={slug} initialData={initialData} />
    </>
  )
}
