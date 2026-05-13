import type { Metadata } from "next"
import Script from "next/script"
import { getLookupSession } from "@/lib/lookup-auth"
import LookupClient from "./lookup-client"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export const metadata: Metadata = {
  title: "Who's Contacting Me? | Identify Political Texts & Emails | RIP Tool",
  description:
    "Getting unwanted political texts or emails? Look up any phone number or email address to instantly identify which political campaign, PAC, or advocacy group is contacting you. Free political spam lookup tool.",
  keywords: [
    "who is texting me politically",
    "political text messages lookup",
    "who is calling me political",
    "identify political spam",
    "political campaign text lookup",
    "who sent me this political email",
    "political robocall lookup",
    "stop political texts",
    "political group contacting me",
    "campaign phone number lookup",
    "PAC email lookup",
    "political spam identifier",
    "who is contacting me",
    "political messaging database",
    "find political campaign by phone number",
    "find political campaign by email",
  ],
  robots: { index: true, follow: true },
  alternates: {
    canonical: `${APP_URL}/lookup`,
  },
  openGraph: {
    title: "Who's Contacting Me? | Identify Political Texts & Emails",
    description:
      "Look up any phone number or email address to find out which political campaign, PAC, or advocacy group is sending you texts and emails. Free political spam lookup.",
    url: `${APP_URL}/lookup`,
    siteName: "RIP Tool",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Who's Contacting Me? | Political Text & Email Lookup",
    description:
      "Instantly identify which political campaign or group is texting or emailing you. Search by phone number or email address — free.",
  },
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Who's Contacting Me? — Political Lookup Tool",
  url: `${APP_URL}/lookup`,
  description:
    "A free tool to identify political campaigns, PACs, and advocacy groups contacting you via text or email. Search by phone number or email address.",
  applicationCategory: "UtilityApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  publisher: {
    "@type": "Organization",
    name: "RIP Tool",
    url: "https://rip-tool.com",
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${APP_URL}/lookup?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
}

export default async function LookupPage() {
  const session = await getLookupSession()
  return (
    <>
      <Script
        id="json-ld-lookup"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LookupClient userEmail={session?.email ?? null} />
    </>
  )
}
