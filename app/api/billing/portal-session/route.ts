import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const client = await prisma.client.findUnique({
      where: { id: user.clientId },
      select: {
        id: true,
        slug: true,
        stripeCustomerId: true,
      },
    })

    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 })
    }

    if (!client.stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 })
    }

    // Create Stripe Customer Portal session
    const isDevelopment = process.env.NODE_ENV === "development"
    const baseUrl = isDevelopment ? "http://localhost:3000" : "https://app.rip-tool.com"
    const returnUrl = `${baseUrl}/${client.slug}?tab=billing`

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: client.stripeCustomerId,
      return_url: returnUrl,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (error) {
    console.error("[Billing Portal] Error creating portal session:", error)
    return NextResponse.json({ error: "Failed to create portal session" }, { status: 500 })
  }
}
