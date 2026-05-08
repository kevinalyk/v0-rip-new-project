import { type NextRequest, NextResponse } from "next/server"
import { verifyAuth } from "@/lib/auth"
import prisma from "@/lib/prisma"
import {
  extractWinRedIdentifiers,
  extractAnedotIdentifiers,
  extractActBlueIdentifiers,
  extractPSQIdentifiers,
  extractRevvIdentifiers,
} from "@/lib/ci-entity-utils"

/**
 * Auto-assign a single unassigned message (email campaign or SMS) to an entity
 * by matching donation platform identifiers (WinRed, Anedot, ActBlue, PSQ, Revv)
 * found in its CTA links.
 *
 * POST /api/admin/auto-assign-single
 * Body: { id: string, type: "email" | "sms" }
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { id, type } = body as { id: string; type: "email" | "sms" }

    if (!id || !type) {
      return NextResponse.json({ error: "Missing required fields: id, type" }, { status: 400 })
    }

    // Fetch the message
    let ctaLinks: any = null

    if (type === "email") {
      const campaign = await prisma.competitiveInsightCampaign.findUnique({
        where: { id },
        select: { id: true, ctaLinks: true, entityId: true },
      })
      if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })
      if (campaign.entityId) return NextResponse.json({ error: "Already assigned" }, { status: 400 })
      ctaLinks = campaign.ctaLinks
    } else {
      const sms = await prisma.smsQueue.findUnique({
        where: { id },
        select: { id: true, ctaLinks: true, entityId: true },
      })
      if (!sms) return NextResponse.json({ error: "SMS not found" }, { status: 404 })
      if (sms.entityId) return NextResponse.json({ error: "Already assigned" }, { status: 400 })
      ctaLinks = sms.ctaLinks
    }

    // Parse CTA links
    const links: Array<{ url: string; finalUrl?: string; type: string }> = Array.isArray(ctaLinks)
      ? ctaLinks
      : typeof ctaLinks === "string"
        ? (() => { try { return JSON.parse(ctaLinks) } catch { return [] } })()
        : []

    if (links.length === 0) {
      return NextResponse.json({ success: false, reason: "No CTA links found in this message" })
    }

    // Extract donation identifiers from all links
    const winredIds = new Set(extractWinRedIdentifiers(links))
    const anedotIds = new Set(extractAnedotIdentifiers(links))
    const actblueIds = new Set(extractActBlueIdentifiers(links))
    const psqIds = new Set(extractPSQIdentifiers(links))
    const revvIds = new Set(extractRevvIdentifiers(links))

    if (
      winredIds.size === 0 &&
      anedotIds.size === 0 &&
      actblueIds.size === 0 &&
      psqIds.size === 0 &&
      revvIds.size === 0
    ) {
      return NextResponse.json({ success: false, reason: "No donation platform identifiers found in CTA links" })
    }

    // Load all entities with donation identifiers
    const entities = await prisma.ciEntity.findMany({
      where: { donationIdentifiers: { not: null }, type: { not: "data_broker" } },
      select: { id: true, name: true, donationIdentifiers: true },
    })

    let matchedEntity: { id: string; name: string; method: string } | null = null

    for (const entity of entities) {
      let ids: any = {}
      try {
        ids =
          typeof entity.donationIdentifiers === "string"
            ? JSON.parse(entity.donationIdentifiers)
            : entity.donationIdentifiers ?? {}
      } catch {
        continue
      }

      const winred: string[] = (ids.winred ?? []).map((s: string) => s.toLowerCase())
      const anedot: string[] = (ids.anedot ?? []).map((s: string) => s.toLowerCase())
      const actblue: string[] = (ids.actblue ?? []).map((s: string) => s.toLowerCase())
      const psq: string[] = (ids.psq ?? []).map((s: string) => s.toLowerCase())
      const revv: string[] = (ids.revv ?? []).map((s: string) => s.toLowerCase())

      if ([...winredIds].some((id) => winred.includes(id))) {
        matchedEntity = { id: entity.id, name: entity.name, method: "auto_winred" }
        break
      }
      if ([...anedotIds].some((id) => anedot.includes(id))) {
        matchedEntity = { id: entity.id, name: entity.name, method: "auto_anedot" }
        break
      }
      if ([...actblueIds].some((id) => actblue.includes(id))) {
        matchedEntity = { id: entity.id, name: entity.name, method: "auto_actblue" }
        break
      }
      if ([...psqIds].some((id) => psq.includes(id))) {
        matchedEntity = { id: entity.id, name: entity.name, method: "auto_psq" }
        break
      }
      if ([...revvIds].some((id) => revv.includes(id))) {
        matchedEntity = { id: entity.id, name: entity.name, method: "auto_revv" }
        break
      }
    }

    if (!matchedEntity) {
      return NextResponse.json({ success: false, reason: "No matching entity found for these donation identifiers" })
    }

    // Assign the message
    if (type === "email") {
      await prisma.competitiveInsightCampaign.update({
        where: { id },
        data: { entityId: matchedEntity.id, assignmentMethod: matchedEntity.method, assignedAt: new Date() },
      })
    } else {
      await prisma.smsQueue.update({
        where: { id },
        data: { entityId: matchedEntity.id, assignmentMethod: matchedEntity.method, assignedAt: new Date() },
      })
    }

    return NextResponse.json({
      success: true,
      entityId: matchedEntity.id,
      entityName: matchedEntity.name,
      method: matchedEntity.method,
    })
  } catch (error) {
    console.error("[auto-assign-single] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
