import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"
import { CheckoutRequiredGate } from "@/components/checkout-required-gate"

export default async function ClientSlugLayout({ children }: { children: ReactNode }) {
  const token = (await cookies()).get("auth_token")?.value
  const payload = token ? await verifyToken(token) : null

  if (!payload || payload.role === "super_admin" || !payload.clientId) {
    return <>{children}</>
  }

  const client = await prisma.client.findUnique({
    where: { id: String(payload.clientId) },
    select: { id: true, slug: true, pendingTrialLengthDays: true },
  })

  // A pending client has signed up but not finished Stripe checkout, so it gets no app access.
  if (!client || client.pendingTrialLengthDays === null) {
    return <>{children}</>
  }

  return (
    <CheckoutRequiredGate
      clientId={client.id}
      clientSlug={client.slug}
      trialDays={client.pendingTrialLengthDays}
      canManageBilling={payload.role === "owner" || payload.role === "admin"}
    />
  )
}
