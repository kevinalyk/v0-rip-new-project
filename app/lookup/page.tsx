import type { Metadata } from "next"
import { getLookupSession } from "@/lib/lookup-auth"
import LookupClient from "./lookup-client"

export const metadata: Metadata = {
  title: "Who's Contacting Me? | Find Political Campaigns & Groups",
  description:
    "Type in the phone number or email you are getting texts from and we will search our database for any campaign or political group that uses it.",
  robots: { index: true, follow: true },
}

export default async function LookupPage() {
  const session = await getLookupSession()
  return <LookupClient userEmail={session?.email ?? null} />
}
