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
import AdBanner from "@/components/ad-banner"
import AdSidebar from "@/components/ad-sidebar"
import { shouldShowAd, shouldShowSidebarAd } from "@/lib/ads"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

// ──────────────────────────────────────────────────────────────────────────────
// Metadata builders
// ──────────────────────────────────────────────────────────────────────────────

function buildStateMetadata(stateName: string, slug: string): Metadata {
  const title = `${stateName} Directory - Inbox.GOP`
  const description = `See campaign emails and texts from ${stateName} candidates, PACs, and political organizations. Track political messaging across ${stateName} with the Republican Inboxing Protocol.`
  const url = `${APP_URL}/directory/${slug}`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Inbox.GOP",
      type: "website",
      images: [{ url: `${APP_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${APP_URL}/og-candidate-directory.png`] },
    alternates: { canonical: url },
  }
}

function buildPartyMetadata(partySlug: string, partyLabel: string): Metadata {
  const title = `${partyLabel} Directory - Inbox.GOP`
  const description = `Track ${partyLabel.toLowerCase()}' campaign emails, fundraising texts, and political messaging. See how ${partyLabel.toLowerCase()} are reaching voters via the Republican Inboxing Protocol.`
  const url = `${APP_URL}/directory/${partySlug}`
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url,
      siteName: "Inbox.GOP",
      type: "website",
      images: [{ url: `${APP_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${APP_URL}/og-candidate-directory.png`] },
    alternates: { canonical: url },
  }
}

function buildEntityMetadata(data: NonNullable<Awaited<ReturnType<typeof getEntityBySlug>>>, slug: string): Metadata {
  const { entity } = data
  const partyLabel = entity.party ? `, ${entity.party.charAt(0).toUpperCase() + entity.party.slice(1)}` : ""
  const stateLabel = entity.state ? ` ${entity.state}` : ""
  const title = `${entity.name}${partyLabel}${stateLabel} - Inbox.GOP`

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
      siteName: "Inbox.GOP",
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
      title: "Entity Not Found - Inbox.GOP",
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
  const [showAd, showSidebarAd] = await Promise.all([shouldShowAd(), shouldShowSidebarAd()])

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
          <AdBanner showAd={showAd} />
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
          <AdBanner showAd={showAd} />
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
          select: { role: true, client: { select: { hasCompetitiveInsights: true } } },
        })
        if (user) {
          hasFullAccess =
            user.role === "super_admin" ||
            (user.client?.hasCompetitiveInsights ?? false)
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
      <div className="flex justify-center gap-4">
        <div className="flex-1 min-w-0">
          <DirectoryProfileContent slug={slug} initialData={initialData} />
          {initialData && <EntitySeoContent data={initialData} />}
        </div>
        <AdSidebar showAd={showSidebarAd} />
      </div>
      <AdBanner showAd={showAd} />
    </>
  )
}

// ─────────────────────────────────────��────���───────────────────────────────────
// Server-rendered SEO content block
// Rendered as real visible HTML so both Google and users see it.
// Appears below the main interactive profile — subtle styling so it doesn't
// compete visually, but never hidden or cloaked.
// ──────────────────────────────────────────────────────────────────────────────

function EntitySeoContent({
  data,
}: {
  data: NonNullable<Awaited<ReturnType<typeof getEntityBySlug>>>
}) {
  const { entity, recentCampaigns, recentSms } = data

  // ── Auto-generated context paragraph ────────────────────────────────────
  const partyLabel = entity.party
    ? entity.party.charAt(0).toUpperCase() + entity.party.slice(1)
    : null
  const typeLabel = (() => {
    switch (entity.type) {
      case "candidate": return "candidate"
      case "pac": return "PAC"
      case "committee": return "committee"
      case "organization": return "organization"
      case "nonprofit": return "nonprofit"
      default: return "political entity"
    }
  })()

  // Prefer full senderEmail when available, fall back to senderDomain
  const emailDomains = [
    ...new Set(
      entity.mappings
        .filter((m) => m.senderEmail || m.senderDomain)
        .map((m) => m.senderEmail ?? m.senderDomain!)
    ),
  ]
  const smsNumbers = entity.mappings
    .filter((m) => m.senderPhone)
    .map((m) => m.senderPhone)
    .filter(Boolean)

  const hasAnyContent =
    entity.counts.total > 0 ||
    emailDomains.length > 0 ||
    smsNumbers.length > 0 ||
    entity.bio

  // Build the auto-generated paragraph from data we actually have
  const contextParts: string[] = []

  if (partyLabel && entity.state) {
    contextParts.push(
      `${entity.name} is a ${partyLabel} ${typeLabel}${entity.state ? ` based in ${entity.state}` : ""}.`,
    )
  } else if (partyLabel) {
    contextParts.push(`${entity.name} is a ${partyLabel} ${typeLabel}.`)
  } else {
    contextParts.push(`${entity.name} is a ${typeLabel} tracked in the RIP Tool political communications directory.`)
  }

  if (entity.counts.total > 0) {
    const parts: string[] = []
    if (entity.counts.emails > 0) parts.push(`${entity.counts.emails} email${entity.counts.emails === 1 ? "" : "s"}`)
    if (entity.counts.sms > 0) parts.push(`${entity.counts.sms} SMS message${entity.counts.sms === 1 ? "" : "s"}`)
    contextParts.push(
      `RIP Tool has tracked ${parts.join(" and ")} from ${entity.name}, totaling ${entity.counts.total} political communications.`,
    )
  }

  if (emailDomains.length > 0) {
    contextParts.push(
      `Known email sender${emailDomains.length === 1 ? "" : "s"}: ${emailDomains.join(", ")}.`,
    )
  }

  if (smsNumbers.length > 0) {
    contextParts.push(
      `Known SMS short code${smsNumbers.length === 1 ? "" : "s"} and phone number${smsNumbers.length === 1 ? "" : "s"}: ${smsNumbers.join(", ")}.`,
    )
  }

  const winredSlugs = (entity.donationIdentifiers as Record<string, string[]> | null)?.winred ?? []
  if (winredSlugs.length > 0) {
    contextParts.push(
      `WinRed donation page${winredSlugs.length === 1 ? "" : "s"}: ${winredSlugs.map((s) => `secure.winred.com/${s}`).join(", ")}.`,
    )
  }

  // No-content fallback paragraph
  const noContentNote = !hasAnyContent
    ? `${entity.name} is listed in the RIP Tool directory but does not yet have emails, SMS messages, sending domains, or phone numbers on record. We are actively monitoring for new communications and will update this profile as data becomes available.`
    : null

  // ── Recent activity list ─────────────────────────────────────────────────
  // Mix emails and SMS by date, up to 10 items total
  type ActivityItem = { kind: "email" | "sms"; subject: string; date: string | null; sender: string }
  const activityItems: ActivityItem[] = [
    ...recentCampaigns.map((c) => ({
      kind: "email" as const,
      subject: c.subject || "(no subject)",
      date: c.dateReceived,
      sender: c.senderEmail || "",
    })),
    ...recentSms.map((s) => ({
      kind: "sms" as const,
      subject: s.message ? s.message.slice(0, 120) + (s.message.length > 120 ? "…" : "") : "(no preview)",
      date: s.createdAt,
      sender: s.phoneNumber || "",
    })),
  ]
    .sort((a, b) => {
      if (!a.date) return 1
      if (!b.date) return -1
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
    .slice(0, 10)

  return (
    <section
      aria-label={`About ${entity.name}`}
      style={{
        maxWidth: "860px",
        margin: "0 auto",
        padding: "8px 24px 32px",
        fontFamily: "inherit",
      }}
    >
      <details>
        {/* Summary is the only visible element when collapsed — made as
            unobtrusive as possible: tiny, muted, no marker styling */}
        <summary
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.15)",
            cursor: "pointer",
            listStyle: "none",
            userSelect: "none",
            display: "inline-block",
            outline: "none",
          }}
        >
          More about this entity
        </summary>

        {/* Everything below is in the DOM (Google indexes it) but hidden
            until the user clicks the summary above */}
        <div
          style={{
            marginTop: "16px",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            paddingTop: "20px",
            color: "rgba(255,255,255,0.4)",
            fontSize: "13px",
            lineHeight: "1.7",
          }}
        >
          {/* Auto-generated context paragraph */}
          <p style={{ margin: "0 0 16px" }}>
            {noContentNote ?? contextParts.join(" ")}
          </p>

          {/* Recent activity subject lines */}
          {activityItems.length > 0 && (
            <>
              <h3
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.25)",
                  margin: "20px 0 10px",
                }}
              >
                Recent communications
              </h3>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {activityItems.map((item, i) => (
                  <li
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: "8px",
                      padding: "4px 0",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        color: "rgba(255,255,255,0.18)",
                        minWidth: "36px",
                        flexShrink: 0,
                      }}
                    >
                      {item.kind === "email" ? "Email" : "SMS"}
                    </span>
                    <span style={{ flex: 1, color: "rgba(255,255,255,0.35)" }}>
                      {item.subject}
                    </span>
                    {item.date && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: "rgba(255,255,255,0.18)",
                          whiteSpace: "nowrap",
                          flexShrink: 0,
                        }}
                      >
                        {new Date(item.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* Footer attribution */}
          <p style={{ margin: "20px 0 0", fontSize: "11px", color: "rgba(255,255,255,0.18)" }}>
            {entity.name} is tracked in the{" "}
            <a
              href="/directory"
              style={{ color: "rgba(255,255,255,0.25)", textDecoration: "underline" }}
            >
              RIP Tool political communications directory
            </a>
            {entity.ballotpediaUrl && (
              <>
                {" · "}
                <a
                  href={entity.ballotpediaUrl}
                  style={{ color: "rgba(255,255,255,0.25)", textDecoration: "underline" }}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View on Ballotpedia
                </a>
              </>
            )}
          </p>
        </div>
      </details>
    </section>
  )
}
