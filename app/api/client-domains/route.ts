import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import crypto from "crypto"

// GET /api/client-domains — list all domains for the current user's client
export async function GET(request: Request) {
  try {
    const user = await getCurrentUser() as any
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const clientSlugParam = searchParams.get("clientSlug")

    let clientId = user.clientId

    // Super admins can pass a clientSlug to view another client's domains
    if (clientSlugParam && user.role === "super_admin") {
      const targetClient = await prisma.client.findUnique({
        where: { slug: clientSlugParam },
        select: { id: true },
      })
      if (targetClient) clientId = targetClient.id
    }

    if (!clientId) return NextResponse.json({ error: "No client associated with account" }, { status: 400 })

    const domains = await prisma.clientDomain.findMany({
      where: { clientId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        domain: true,
        status: true,
        verificationToken: true,
        verifiedAt: true,
        lastCheckedAt: true,
        createdAt: true,
        submittedBy: { select: { firstName: true, lastName: true, email: true } },
      },
    })

    return NextResponse.json({ domains })
  } catch (err) {
    console.error("[client-domains GET]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST /api/client-domains — submit a new domain for verification
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser() as any
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json()
    const clientSlugParam = (body.clientSlug ?? "").trim()

    let clientId = user.clientId

    // Super admins can submit domains on behalf of another client
    if (clientSlugParam && user.role === "super_admin") {
      const targetClient = await prisma.client.findUnique({
        where: { slug: clientSlugParam },
        select: { id: true },
      })
      if (targetClient) clientId = targetClient.id
    }

    if (!clientId) return NextResponse.json({ error: "No client associated with account" }, { status: 400 })
    const domain = (body.domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "")

    if (!domain) return NextResponse.json({ error: "Domain is required" }, { status: 400 })

    // Basic domain format validation
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) {
      return NextResponse.json({ error: "Invalid domain format" }, { status: 400 })
    }

    // Check for duplicate
    const existing = await prisma.clientDomain.findUnique({
      where: { clientId_domain: { clientId, domain } },
    })
    if (existing) {
      return NextResponse.json({ error: "Domain already added", domain: existing }, { status: 409 })
    }

    // Generate a unique verification token
    const verificationToken = `inboxgop-verify=${crypto.randomBytes(16).toString("hex")}`

    const clientDomain = await prisma.clientDomain.create({
      data: {
        clientId,
        domain,
        status: "pending",
        verificationToken,
        submittedByUserId: user.id,
      },
    })

    return NextResponse.json({ domain: clientDomain }, { status: 201 })
  } catch (err) {
    console.error("[client-domains POST]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
