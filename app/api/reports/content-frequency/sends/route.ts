import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { nanoid } from "nanoid"

/** Ensure a row has a shareToken, generating and persisting one if missing. */
async function ensureShareToken(id: string, existing: string | null, table: "email" | "sms" = "email"): Promise<string> {
  if (existing) return existing
  const token = nanoid(16)
  if (table === "sms") {
    await prisma.smsQueue.update({ where: { id }, data: { shareToken: token, shareTokenCreatedAt: new Date(), shareTokenSource: "Content Frequency" } })
  } else {
    await prisma.competitiveInsightCampaign.update({ where: { id }, data: { shareToken: token, shareTokenCreatedAt: new Date(), shareTokenSource: "Content Frequency" } })
  }
  return token
}

export interface SendRow {
  id: string
  shareToken: string
  date: string
  preview: string
  entityName: string | null
  entityParty: string | null
  sendingNumber?: string | null
}

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth?.success || !auth.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const clientSlug = searchParams.get("clientSlug")
    const type = searchParams.get("type") as "subject" | "email-body" | "sms-body" | null
    const key = searchParams.get("key") // subject string OR bodyFingerprint string
    const entityId = searchParams.get("entityId") || null

    if (!type || !key) {
      return NextResponse.json({ error: "Missing type or key" }, { status: 400 })
    }

    // Auth / plan gate
    const isSuperAdmin = auth.user.role === "super_admin"
    if (!isSuperAdmin) {
      const clientId = auth.user.clientId
      const client = await prisma.client.findUnique({ where: { id: clientId! }, select: { subscriptionPlan: true } })
      if (client?.subscriptionPlan !== "all" && client?.subscriptionPlan !== "enterprise") {
        return NextResponse.json({ error: "Upgrade required" }, { status: 403 })
      }
    }

    if (type === "subject") {
      const rows = await prisma.competitiveInsightCampaign.findMany({
        where: {
          subject: key,
          isHidden: false,
          isDeleted: false,
          ...(entityId ? { entityId } : {}),
        },
        select: {
          id: true,
          shareToken: true,
          dateReceived: true,
          subject: true,
          emailPreview: true,
          entity: { select: { name: true, party: true } },
        },
        orderBy: { dateReceived: "desc" },
        take: 100,
      })

      const sends: SendRow[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          shareToken: await ensureShareToken(r.id, r.shareToken),
          date: r.dateReceived?.toISOString() ?? "",
          // For subject drilldown just show the subject — no body preview
          preview: r.subject || "",
          entityName: r.entity?.name ?? null,
          entityParty: r.entity?.party ?? null,
        }))
      )

      return NextResponse.json({ sends })
    }

    if (type === "email-body") {
      const rows = await prisma.competitiveInsightCampaign.findMany({
        where: {
          bodyFingerprint: key,
          isHidden: false,
          isDeleted: false,
          ...(entityId ? { entityId } : {}),
        },
        select: {
          id: true,
          shareToken: true,
          dateReceived: true,
          subject: true,
          entity: { select: { name: true, party: true } },
        },
        orderBy: { dateReceived: "desc" },
        take: 100,
      })

      const sends: SendRow[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          shareToken: await ensureShareToken(r.id, r.shareToken),
          date: r.dateReceived?.toISOString() ?? "",
          // Show subject as the label for each body send
          preview: r.subject || "",
          entityName: r.entity?.name ?? null,
          entityParty: r.entity?.party ?? null,
        }))
      )

      return NextResponse.json({ sends })
    }

    if (type === "sms-body") {
      const rows = await prisma.smsQueue.findMany({
        where: {
          bodyFingerprint: key,
          isHidden: false,
          isDeleted: false,
          ...(entityId ? { entityId } : {}),
        },
        select: {
          id: true,
          shareToken: true,
          createdAt: true,
          message: true,
          phoneNumber: true,
          entity: { select: { name: true, party: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      })

      const sends: SendRow[] = await Promise.all(
        rows.map(async (r) => ({
          id: r.id,
          shareToken: await ensureShareToken(r.id, r.shareToken, "sms"),
          date: r.createdAt?.toISOString() ?? "",
          preview: r.message || "",
          entityName: r.entity?.name ?? null,
          entityParty: r.entity?.party ?? null,
          sendingNumber: r.phoneNumber,
        }))
      )

      return NextResponse.json({ sends })
    }

    return NextResponse.json({ error: "Invalid type" }, { status: 400 })
  } catch (err) {
    console.error("[content-frequency/sends]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
