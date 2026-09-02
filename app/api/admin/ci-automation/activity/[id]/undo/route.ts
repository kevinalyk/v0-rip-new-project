/**
 * POST /api/admin/ci-automation/activity/[id]/undo
 * Reverts a single CiApiActionLog action. Super_admin only. Handles the 3
 * possible actions differently:
 *
 *   - assign_messages:            clears entityId/assignedAt/assignmentMethod
 *                                 back to unassigned on the exact target
 *                                 message IDs recorded on the log row.
 *   - update_entity_identifiers:  restores donationIdentifiers to the
 *                                 `beforeState` snapshot taken at call time.
 *   - create_entity:              deletes the entity, but ONLY if nothing
 *                                 currently references it (to avoid
 *                                 orphaning messages that were separately
 *                                 assigned to it afterward, including by a
 *                                 human). Returns 409 if blocked.
 *   - delete_messages:            clears isDeleted/deletedAt/deletedBy back
 *                                 to not-deleted on the exact target message
 *                                 IDs recorded on the log row.
 *
 * Already-undone rows are rejected with 409.
 */

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/ci-api-auth"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireSuperAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const log = await prisma.ciApiActionLog.findUnique({ where: { id } })
  if (!log) {
    return NextResponse.json({ error: "Log entry not found" }, { status: 404 })
  }
  if (log.undone) {
    return NextResponse.json({ error: "This action has already been undone" }, { status: 409 })
  }

  if (log.action === "assign_messages") {
    const targetIds = Array.isArray(log.targetIds) ? (log.targetIds as string[]) : []
    if (targetIds.length > 0) {
      await prisma.competitiveInsightCampaign.updateMany({
        where: { id: { in: targetIds }, entityId: log.entityId ?? undefined },
        data: { entityId: null, assignedAt: null, assignmentMethod: null },
      })
      await prisma.smsQueue.updateMany({
        where: { id: { in: targetIds }, entityId: log.entityId ?? undefined },
        data: { entityId: null, assignedAt: null, assignmentMethod: null },
      })
    }
  } else if (log.action === "update_entity_identifiers") {
    if (!log.entityId) {
      return NextResponse.json({ error: "Log entry is missing entityId" }, { status: 400 })
    }
    await prisma.ciEntity.update({
      where: { id: log.entityId },
      data: { donationIdentifiers: (log.beforeState as never) ?? {} },
    })
  } else if (log.action === "create_entity") {
    if (!log.entityId) {
      return NextResponse.json({ error: "Log entry is missing entityId" }, { status: 400 })
    }
    const [campaignCount, smsCount] = await Promise.all([
      prisma.competitiveInsightCampaign.count({ where: { entityId: log.entityId } }),
      prisma.smsQueue.count({ where: { entityId: log.entityId } }),
    ])
    if (campaignCount > 0 || smsCount > 0) {
      return NextResponse.json(
        {
          error:
            "Cannot undo: this entity now has messages assigned to it. Reassign or delete those first, then undo.",
        },
        { status: 409 },
      )
    }
    await prisma.ciEntity.delete({ where: { id: log.entityId } })
  } else if (log.action === "delete_messages") {
    const targetIds = Array.isArray(log.targetIds) ? (log.targetIds as string[]) : []
    if (targetIds.length > 0) {
      await prisma.competitiveInsightCampaign.updateMany({
        where: { id: { in: targetIds } },
        data: { isDeleted: false, deletedAt: null, deletedBy: null },
      })
      await prisma.smsQueue.updateMany({
        where: { id: { in: targetIds } },
        data: { isDeleted: false, deletedAt: null, deletedBy: null },
      })
    }
  } else {
    return NextResponse.json({ error: `Unknown action type: ${log.action}` }, { status: 400 })
  }

  await prisma.ciApiActionLog.update({
    where: { id },
    data: { undone: true, undoneAt: new Date(), undoneBy: admin.id },
  })

  return NextResponse.json({ success: true })
}
