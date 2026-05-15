// JSON-LD structured data components for SEO

interface JsonLdProps {
  data: Record<string, any>
}

export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}

// Directory-wide Organization schema
export function DirectoryJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "Inbox.GOP Directory",
        url: "https://app.rip-tool.com/directory",
        description: "Track political campaign emails and texts from candidates, PACs, and organizations across the United States.",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: "https://app.rip-tool.com/directory?q={search_term_string}",
          },
          "query-input": "required name=search_term_string",
        },
      }}
    />
  )
}

// Lookup page schema
export function LookupJsonLd() {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Who's Contacting Me?",
        url: "https://app.rip-tool.com/lookup",
        applicationCategory: "UtilityApplication",
        description: "Identify which political campaigns, PACs, or advocacy groups are sending you texts and emails.",
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
        },
      }}
    />
  )
}

// Individual entity schema
interface EntityJsonLdProps {
  name: string
  type: string
  state?: string | null
  party?: string | null
  description?: string | null
  url: string
  imageUrl?: string | null
  totalMessages: number
}

export function EntityJsonLd({
  name,
  type,
  state,
  party,
  description,
  url,
  imageUrl,
  totalMessages,
}: EntityJsonLdProps) {
  const schemaType = type === "candidate" || type === "politician" ? "Person" : "Organization"
  
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": schemaType,
        name,
        ...(description && { description }),
        url,
        ...(imageUrl && { image: imageUrl }),
        ...(state && { address: { "@type": "PostalAddress", addressRegion: state } }),
        ...(party && { affiliation: party }),
        interactionStatistic: {
          "@type": "InteractionCounter",
          interactionType: "https://schema.org/ReceiveAction",
          userInteractionCount: totalMessages,
        },
      }}
    />
  )
}

// Digest article schema
interface DigestJsonLdProps {
  title: string
  summary: string
  publishedAt: Date
  url: string
  imageUrl?: string | null
  tags?: string[]
}

export function DigestJsonLd({
  title,
  summary,
  publishedAt,
  url,
  imageUrl,
  tags,
}: DigestJsonLdProps) {
  return (
    <JsonLd
      data={{
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        headline: title,
        description: summary,
        datePublished: publishedAt.toISOString(),
        url,
        ...(imageUrl && {
          image: {
            "@type": "ImageObject",
            url: imageUrl,
          },
        }),
        publisher: {
          "@type": "Organization",
          name: "Inbox.GOP",
          url: "https://app.rip-tool.com",
        },
        ...(tags && tags.length > 0 && { keywords: tags.join(", ") }),
      }}
    />
  )
}
