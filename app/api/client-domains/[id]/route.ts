import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"

// DELETE /api/client-domains/[id] — remove a domain
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser() as any
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const clientId = user.clientId
    if (!clientId) return NextResponse.json({ error: "No client associated with account" }, { status: 400 })

    const record = await prisma.clientDomain.findUnique({ where: { id: params.id } })
    if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (record.clientId !== clientId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    await prisma.clientDomain.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[client-domains DELETE]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
