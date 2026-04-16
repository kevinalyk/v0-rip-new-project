import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import Stripe from "stripe"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-02-24.acacia" })

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const clientSlugParam = request.nextUrl.searchParams.get("clientSlug")
    let targetClientId = user.clientId

    if (clientSlugParam && clientSlugParam !== "admin" && clientSlugParam !== "rip") {
      const targetClient = await prisma.client.findUnique({
        where: { slug: clientSlugParam },
        select: { id: true },
      })
      if (targetClient) {
        // Super admins can view any client; regular users only their own
        if (user.role === "super_admin" || targetClient.id === user.clientId) {
          targetClientId = targetClient.id
        }
      }
    }

    const client = await prisma.client.findUnique({
      where: { id: targetClientId },
      select: { stripeCustomerId: true },
    })

    if (!client?.stripeCustomerId) {
      return NextResponse.json({ invoices: [] })
    }

    const invoicesResponse = await stripe.invoices.list({
      customer: client.stripeCustomerId,
      limit: 24, // up to 2 years of monthly invoices
      expand: ["data.charge"],
    })

    const invoices = invoicesResponse.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      created: inv.created,
      periodStart: inv.period_start,
      periodEnd: inv.period_end,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdf: inv.invoice_pdf,
      description: inv.description || inv.lines?.data?.[0]?.description || null,
    }))

    return NextResponse.json({ invoices })
  } catch (error) {
    console.error("Error fetching invoices:", error)
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 })
  }
}
