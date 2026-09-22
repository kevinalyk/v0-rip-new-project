import { NextResponse } from "next/server"

import { createToken, getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  normalizedWorkspaceName,
  workspaceSlug,
} from "@/lib/services/personal-account-service"

const ACTIONS = new Set(["continue_free", "upgrade_basic", "upgrade_professional"])

export async function GET() {
  const session = await getCurrentUser() as { userId?: string } | null
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      signupSource: true,
      webOnboardingCompletedAt: true,
      client: { select: { id: true, name: true, slug: true, accountKind: true } },
    },
  })
  if (!user?.client) return NextResponse.json({ error: "Account workspace not found" }, { status: 404 })

  return NextResponse.json({
    workspace: user.client,
    requiresWebOnboarding:
      user.signupSource === "ios" &&
      user.webOnboardingCompletedAt === null &&
      user.client.accountKind === "personal",
  })
}

export async function POST(request: Request) {
  const session = await getCurrentUser() as { userId?: string } | null
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null) as { action?: string; workspaceName?: unknown } | null
  if (!body?.action || !ACTIONS.has(body.action)) {
    return NextResponse.json({ error: "Choose a valid account option" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { client: true },
  })
  if (!user?.client) return NextResponse.json({ error: "Account workspace not found" }, { status: 404 })
  if (user.signupSource !== "ios" || user.client.accountKind !== "personal") {
    return NextResponse.json({ error: "This account does not require mobile web setup" }, { status: 409 })
  }

  const requestedName = normalizedWorkspaceName(body.workspaceName) || user.client.name
  if (requestedName.length < 2) {
    return NextResponse.json({ error: "Workspace name must be at least 2 characters" }, { status: 400 })
  }

  const requestedSlug = workspaceSlug(requestedName, user.id.slice(-8))
  const collision = await prisma.client.findFirst({
    where: {
      id: { not: user.client.id },
      OR: [
        { name: { equals: requestedName, mode: "insensitive" } },
        { slug: requestedSlug },
      ],
    },
    select: { id: true },
  })
  if (collision) {
    return NextResponse.json(
      { error: "That workspace name is already in use. Please choose another." },
      { status: 409 },
    )
  }

  await prisma.$transaction([
    prisma.client.update({
      where: { id: user.client.id },
      data: { name: requestedName, slug: requestedSlug },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { webOnboardingCompletedAt: new Date() },
    }),
  ])

  const token = await createToken({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    clientId: user.client.id,
    clientSlug: requestedSlug,
  })

  const plan = body.action === "upgrade_basic"
    ? "paid"
    : body.action === "upgrade_professional"
      ? "all"
      : null
  const redirectTo = plan
    ? `/${requestedSlug}/billing?plan=${plan}`
    : `/${requestedSlug}`
  const response = NextResponse.json({ ok: true, redirectTo })
  response.cookies.set({
    name: "auth_token",
    value: token,
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  })
  return response
}
