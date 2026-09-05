import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// PATCH /api/client-domains/[id]/manual-checks — mark (or un-mark) a single Domain Health
// check as self-verified for this domain. This is only meant for checks we cannot fully
// automate (e.g. "Unsubscribe Honored Within 2 Days", "Spam Rate Below 0.10%") — it does
// NOT flip the check to "pass" for scoring purposes, it just records a "reviewed by a human"
// note so the button in the UI isn't a dead end.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser() as any
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const clientSlugParam = (body.clientSlug ?? "").trim()
    const checkId = (body.checkId ?? "").trim()
    const verified = Boolean(body.verified)

    if (!checkId) return NextResponse.json({ error: "checkId is required" }, { status: 400 })

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

    const current = (record.manualCheckVerifications ?? {}) as Record<string, unknown>
    const next = { ...current }

    if (verified) {
      next[checkId] = {
        verifiedAt: new Date().toISOString(),
        verifiedByUserId: user.userId ?? user.id,
        verifiedByEmail: user.email,
      }
    } else {
      delete next[checkId]
    }

    const updated = await prisma.clientDomain.update({
      where: { id: record.id },
      data: { manualCheckVerifications: next },
    })

    return NextResponse.json({
      success: true,
      manualCheckVerifications: updated.manualCheckVerifications,
    })
  } catch (err) {
    console.error("[client-domains manual-checks PATCH]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
