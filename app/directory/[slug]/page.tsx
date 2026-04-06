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

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${APP_URL}/directory/${slug}`,
      siteName: "RIP Tool",
      type: "profile",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    alternates: {
      canonical: `${APP_URL}/directory/${slug}`,
    },
  }
}

export default async function DirectoryProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <DirectoryProfileContent slug={slug} />
}
