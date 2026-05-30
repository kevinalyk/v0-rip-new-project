import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import dns from "dns/promises"

// POST /api/client-domains/[id]/verify — perform a live DNS TXT lookup for the token
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser() as any
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const clientId = user.clientId
    if (!clientId) return NextResponse.json({ error: "No client associated with account" }, { status: 400 })

    const record = await prisma.clientDomain.findUnique({
      where: { id: params.id },
    })

    if (!record) return NextResponse.json({ error: "Domain not found" }, { status: 404 })
    if (record.clientId !== clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (record.status === "verified") {
      return NextResponse.json({ verified: true, status: "verified" })
    }

    // Resolve TXT records for the domain root and _inboxgop-verify subdomain
    let found = false
    const hostsToCheck = [record.domain, `_inboxgop-verify.${record.domain}`]

    for (const host of hostsToCheck) {
      try {
        const txtRecords = await dns.resolveTxt(host)
        // txtRecords is string[][] — each entry is an array of chunks for one record
        const flat = txtRecords.map((chunks) => chunks.join(""))
        if (flat.some((txt) => txt === record.verificationToken)) {
          found = true
          break
        }
      } catch {
        // ENOTFOUND / ENODATA is fine — just means no record there
      }
    }

    const now = new Date()
    const updated = await prisma.clientDomain.update({
      where: { id: record.id },
      data: {
        status: found ? "verified" : "pending",
        verifiedAt: found ? now : null,
        lastCheckedAt: now,
      },
    })

    return NextResponse.json({
      verified: found,
      status: updated.status,
      message: found
        ? "Domain verified successfully."
        : "Token not found in DNS. Make sure the TXT record has propagated (can take up to 48 hours).",
    })
  } catch (err) {
    console.error("[client-domains verify]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
