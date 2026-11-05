import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"

/**
 * Collapse the common ways to mint extra addresses for one inbox: "+tag" suffixes, dots in
 * Gmail local parts, and the googlemail.com alias. Everything else is just lowercased.
 */
export function canonicalEmail(email: string): string {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@")
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain
  let local = rawLocal.split("+")[0]
  if (domain === "gmail.com") local = local.replace(/\./g, "")
  return `${local}@${domain}`
}

/**
 * A person gets one free trial. They are ineligible if any existing account, or any past
 * Stripe customer (which survives account deletion), maps to the same canonical email.
 * Fails open if Stripe can't be reached so a Stripe outage doesn't punish real new signups.
 */
export async function isEligibleForFreeTrial(email: string): Promise<boolean> {
  const canonical = canonicalEmail(email)

  const aliasMatches = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "User"
    WHERE (
      CASE
        WHEN split_part(lower(email), '@', 2) IN ('gmail.com', 'googlemail.com')
          THEN replace(split_part(split_part(lower(email), '@', 1), '+', 1), '.', '') || '@gmail.com'
        ELSE split_part(split_part(lower(email), '@', 1), '+', 1) || '@' || split_part(lower(email), '@', 2)
      END
    ) = ${canonical}
  `
  if ((aliasMatches[0]?.count ?? 0) > 0) return false

  try {
    const emailsToCheck = Array.from(new Set([email.trim().toLowerCase(), canonical]))
    for (const candidate of emailsToCheck) {
      const customers = await stripe.customers.list({ email: candidate, limit: 1 })
      if (customers.data.length > 0) return false
    }
  } catch (error) {
    console.error("[Trial Eligibility] Stripe customer lookup failed, allowing trial:", error)
  }

  return true
}
