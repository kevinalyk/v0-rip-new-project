import type { Metadata } from "next"
import { getLookupSession } from "@/lib/lookup-auth"
import LookupClient from "./lookup-client"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export const metadata: Metadata = {
  title: "Who's Contacting Me? | Find Political Campaigns & Groups",
  description:
    "Type in the phone number or email you are getting texts from and we will search our database for any campaign or political group that uses it.",
  robots: { index: true, follow: true },
  alternates: {
    canonical: `${APP_URL}/lookup`,
  },
  openGraph: {
    title: "Who's Contacting Me?",
    description:
      "Find out what political campaign or group is texting or emailing you. Search our database by phone number or email address.",
    url: `${APP_URL}/lookup`,
    siteName: "RIP Tool",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Who's Contacting Me?",
    description:
      "Find out what political campaign or group is texting or emailing you.",
  },
}

export default async function LookupPage() {
  const session = await getLookupSession()
  return <LookupClient userEmail={session?.email ?? null} />
}
