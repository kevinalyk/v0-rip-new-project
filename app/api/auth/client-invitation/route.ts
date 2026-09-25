import { createHash } from "crypto"
import { NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"

import { createToken, getCurrentUser } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { notifyMobileAccountAccess } from "@/lib/services/mobile-alert-delivery-service"
import { formatPlanName, type SubscriptionPlan } from "@/lib/subscription-utils"

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

async function loadInvitation(rawToken: string) {
  return prisma.clientJoinInvitation.findUnique({
    where: { tokenHash: tokenHash(rawToken) },
    include: {
      targetClient: {
        select: {
          id: true,
          name: true,
          slug: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
        },
      },
      user: { select: { email: true } },
    },
  })
}

export async function GET(request: Request) {
  const rawToken = new URL(request.url).searchParams.get("token") || ""
  if (!rawToken) return NextResponse.json({ error: "Invitation token is required" }, { status: 400 })
  const invitation = await loadInvitation(rawToken)
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This invitation is invalid or has expired" }, { status: 400 })
  }
  return NextResponse.json({
    organizationName: invitation.targetClient.name,
    email: invitation.user.email,
    role: invitation.invitedRole,
  })
}

export async function POST(request: Request) {
  const session = await getCurrentUser() as { userId?: string } | null
  if (!session?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as { token?: string } | null
  if (!body?.token) return NextResponse.json({ error: "Invitation token is required" }, { status: 400 })

  const invitation = await loadInvitation(body.token)
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    return NextResponse.json({ error: "This invitation is invalid or has expired" }, { status: 400 })
  }
  if (invitation.userId !== session.userId) {
    return NextResponse.json({ error: "Sign in with the email address that received this invitation" }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id: invitation.userId },
    include: { client: { select: { id: true, accountKind: true } } },
  })
  if (!user?.client || user.client.accountKind !== "personal" || user.signupSource !== "ios") {
    return NextResponse.json({ error: "This account can no longer accept the invitation" }, { status: 409 })
  }
  const previousClientId = user.client.id

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.ciEntitySubscription.updateMany({
      where: { userId: user.id },
      data: { clientId: invitation.targetClientId },
    })
    await tx.ciView.updateMany({
      where: { createdBy: user.id },
      data: { clientId: invitation.targetClientId },
    })
    await tx.campaignAlertSubscription.updateMany({
      where: { userId: user.id },
      data: { clientId: invitation.targetClientId },
    })
    await tx.user.update({
      where: { id: user.id },
      data: {
        clientId: invitation.targetClientId,
        role: invitation.invitedRole,
        webOnboardingCompletedAt: new Date(),
      },
    })
    await tx.clientJoinInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date() },
    })
    await tx.client.update({
      where: { id: previousClientId },
      data: { active: false },
    })
  })

  const token = await createToken({
    userId: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: invitation.invitedRole,
    clientId: invitation.targetClient.id,
    clientSlug: invitation.targetClient.slug,
  })

  const clientCoversMobile =
    invitation.targetClient.subscriptionPlan !== "free" &&
    ["active", "trialing"].includes(invitation.targetClient.subscriptionStatus)
  if (clientCoversMobile) {
    const planName = formatPlanName(invitation.targetClient.subscriptionPlan as SubscriptionPlan)
    await notifyMobileAccountAccess(user.id, `join-${invitation.id}`, {
      kind: "covered",
      clientName: invitation.targetClient.name,
      planName,
    }).catch((error) => console.error("[Invitation] Coverage push failed:", error))
  }

  const response = NextResponse.json({ ok: true, redirectTo: `/${invitation.targetClient.slug}` })
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
