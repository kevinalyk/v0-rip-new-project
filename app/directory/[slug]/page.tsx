import type { Metadata } from "next"
import { DirectoryProfileContent } from "@/components/directory-profile-content"
import { getEntityBySlug } from "@/lib/directory"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getEntityBySlug(slug)

  if (!data) {
    return {
      title: "Entity Not Found | RIP Directory",
      description: "This entity could not be found in the RIP directory.",
    }
  }

  const { entity } = data
  const partyLabel = entity.party ? ` · ${entity.party.charAt(0).toUpperCase() + entity.party.slice(1)}` : ""
  const stateLabel = entity.state ? ` · ${entity.state}` : ""
  const title = `${entity.name}${partyLabel}${stateLabel} | RIP Directory`
  const description = entity.description
    ? entity.description
    : `Track ${entity.name}'s email and SMS communications. ${entity.counts.total} total messages captured.`

  // Only use the scraped image as the OG image if it's a public Blob URL —
  // private Blob URLs are inaccessible to social media crawlers.
  const isPublicBlobUrl = (url: string | null) =>
    !!url && url.includes("public.blob.vercel-storage.com")

  const ogImage = isPublicBlobUrl(entity.imageUrl)
    ? { url: entity.imageUrl as string, width: 400, height: 500, alt: entity.name }
    : { url: `${APP_URL}/og-image.png`, width: 1200, height: 630, alt: "RIP Tool" }

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

function buildStructuredData(data: NonNullable<Awaited<ReturnType<typeof getEntityBySlug>>>) {
  const { entity } = data
  const url = `${APP_URL}/directory/${entity.slug}`
  // Use Person schema for politicians and candidates, Organization for PACs/orgs/others
  const isPerson = entity.type === "candidate" || entity.type === "politician"

  // sameAs: external authoritative profiles that confirm this entity's identity
  const sameAs: string[] = []
  if (entity.ballotpediaUrl) sameAs.push(entity.ballotpediaUrl)
  const winredSlugs = entity.donationIdentifiers?.winred ?? []
  for (const slug of winredSlugs) {
    sameAs.push(`https://secure.winred.com/${slug}`)
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
        ? {
            homeLocation: {
              "@type": "AdministrativeArea",
              name: entity.state,
            },
          }
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
    ...(partyLabel
      ? {
          memberOf: { "@type": "Organization", name: partyLabel },
        }
      : {}),
    ...(entity.state
      ? {
          areaServed: {
            "@type": "AdministrativeArea",
            name: entity.state,
          },
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
  }
}

function buildBreadcrumbData(entityName: string, slug: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Directory",
        item: `${APP_URL}/directory`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: entityName,
        item: `${APP_URL}/directory/${slug}`,
      },
    ],
  }
}

export default async function DirectoryProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Fetch data server-side so the initial HTML response contains the full profile
  // content for crawlers and social media previews, not just a loading spinner.
  const initialData = await getEntityBySlug(slug)

  // Inject JSON-LD structured data so Google can understand this entity as a
  // Person (politician) or Organization (PAC/org) — enables rich results and
  // helps with knowledge graph eligibility.
  const structuredData = initialData ? buildStructuredData(initialData) : null
  const breadcrumbData = initialData ? buildBreadcrumbData(initialData.entity.name, slug) : null

  return (
    <>
      {structuredData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      )}
      {breadcrumbData && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbData) }}
        />
      )}
      <DirectoryProfileContent slug={slug} initialData={initialData} />
    </>
  )
}
