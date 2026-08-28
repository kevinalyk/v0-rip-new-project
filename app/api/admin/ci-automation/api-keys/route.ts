/**
 * Manage API keys scoped to the Claude CI Assignment MCP server
 * (app/api/mcp/ci-assignment/route.ts). Super_admin only - see
 * requireSuperAdmin in lib/ci-api-auth.ts for why this is stricter than the
 * generic /api/admin/api-keys route.
 *
 * GET  -> list keys with scope "ci:*" (never returns key material)
 * POST -> create a new key with an explicit subset of CI_ASSIGNMENT_ALL_SCOPES
 *         (raw key returned once, never stored)
 */

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireSuperAdmin, generateCiApiKey, CI_ASSIGNMENT_ALL_SCOPES, type CiScope } from "@/lib/ci-api-auth"

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // scopes is a JSON column (not a native Postgres array), so Prisma can't
  // filter it in the DB - fetch all keys and filter in application code for
  // any key that carries at least one ci:* scope.
  const allKeys = await prisma.apiKey.findMany({
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      isActive: true,
      revokedAt: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
      requestCount: true,
      createdBy: true,
    },
    orderBy: { createdAt: "desc" },
  })

  const keys = allKeys.filter((k: (typeof allKeys)[number]) => {
    const scopes = Array.isArray(k.scopes) ? (k.scopes as string[]) : []
    return scopes.some((s) => (CI_ASSIGNMENT_ALL_SCOPES as string[]).includes(s))
  })

  return NextResponse.json({ keys })
}

export async function POST(request: Request) {
  const admin = await requireSuperAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, scopes } = body as { name?: string; scopes?: string[] }

  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 })
  }

  const requestedScopes = Array.isArray(scopes) && scopes.length > 0 ? scopes : CI_ASSIGNMENT_ALL_SCOPES
  const invalidScope = requestedScopes.find((s) => !CI_ASSIGNMENT_ALL_SCOPES.includes(s as CiScope))
  if (invalidScope) {
    return NextResponse.json(
      { error: `Invalid scope "${invalidScope}". Valid scopes: ${CI_ASSIGNMENT_ALL_SCOPES.join(", ")}` },
      { status: 400 },
    )
  }

  const { key, keyHash, keyPrefix } = generateCiApiKey()

  const apiKey = await prisma.apiKey.create({
    data: {
      name: name.trim(),
      keyHash,
      keyPrefix,
      scopes: requestedScopes,
      rateLimit: 1000,
      createdBy: admin.id,
      isActive: true,
    },
  })

  return NextResponse.json(
    {
      id: apiKey.id,
      name: apiKey.name,
      key, // shown once - the UI must warn the user this cannot be retrieved again
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      createdAt: apiKey.createdAt,
    },
    { status: 201 },
  )
}
