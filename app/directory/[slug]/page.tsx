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

export default async function DirectoryProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  // Fetch data server-side so the initial HTML response contains the full profile
  // content for crawlers and social media previews, not just a loading spinner.
  const initialData = await getEntityBySlug(slug)
  return <DirectoryProfileContent slug={slug} initialData={initialData} />
}
