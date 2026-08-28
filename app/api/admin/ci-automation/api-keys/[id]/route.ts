/**
 * DELETE /api/admin/ci-automation/api-keys/[id]
 * Revokes (does not delete) a CI-assignment API key. Revocation is
 * immediate and irreversible from the UI - a new key must be issued if
 * access is needed again. Super_admin only.
 */

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireSuperAdmin, CI_ASSIGNMENT_ALL_SCOPES } from "@/lib/ci-api-auth"

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params

  const apiKey = await prisma.apiKey.findUnique({ where: { id } })
  const scopes = Array.isArray(apiKey?.scopes) ? (apiKey.scopes as string[]) : []
  if (!apiKey || !scopes.some((s) => (CI_ASSIGNMENT_ALL_SCOPES as string[]).includes(s))) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 })
  }

  await prisma.apiKey.update({
    where: { id },
    data: { isActive: false, revokedAt: new Date() },
  })

  return NextResponse.json({ success: true })
}
