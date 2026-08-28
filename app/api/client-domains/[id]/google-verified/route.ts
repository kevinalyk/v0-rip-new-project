import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// PATCH /api/client-domains/[id]/google-verified — toggle the self-reported
// "Google Verified" flag for a single domain. Unique per domain (ClientDomain row),
// never carried over between domains.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser() as any
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const clientSlugParam = (body.clientSlug ?? "").trim()
    const googleVerified = Boolean(body.googleVerified)

    let clientId = user.clientId

    // Super admins can toggle on behalf of another client when impersonating
    if (clientSlugParam && user.role === "super_admin") {
      const targetClient = await prisma.client.findUnique({
        where: { slug: clientSlugParam },
        select: { id: true },
      })
      if (targetClient) clientId = targetClient.id
    }

    if (!clientId) return NextResponse.json({ error: "No client associated with account" }, { status: 400 })

    const record = await prisma.clientDomain.findUnique({ where: { id: params.id } })
    if (!record) return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    if (record.clientId !== clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const updated = await prisma.clientDomain.update({
      where: { id: record.id },
      data: {
        googleVerified,
        googleVerifiedAt: googleVerified ? new Date() : null,
        googleVerifiedByUserId: googleVerified ? user.id : null,
      },
    })

    return NextResponse.json({
      success: true,
      googleVerified: updated.googleVerified,
      googleVerifiedAt: updated.googleVerifiedAt,
    })
  } catch (err) {
    console.error("[client-domains google-verified PATCH]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
