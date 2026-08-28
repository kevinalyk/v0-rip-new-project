/**
 * GET/PATCH the global kill switch for the Claude CI Assignment MCP
 * (AutomationSetting.ciAssignmentEnabled). Super_admin only. Read-only MCP
 * tools (list_unassigned_messages, list_entities) are unaffected by this
 * switch - it only blocks the 3 write tools (see assertAutomationEnabled in
 * lib/ci-api-auth.ts).
 */

import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { requireSuperAdmin } from "@/lib/ci-api-auth"

export async function GET(request: Request) {
  const admin = await requireSuperAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let settings = await prisma.automationSetting.findFirst()
  if (!settings) {
    settings = await prisma.automationSetting.create({ data: { ciAssignmentEnabled: true } })
  }

  return NextResponse.json({ ciAssignmentEnabled: settings.ciAssignmentEnabled, updatedAt: settings.updatedAt })
}

export async function PATCH(request: Request) {
  const admin = await requireSuperAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { ciAssignmentEnabled } = body as { ciAssignmentEnabled?: boolean }
  if (typeof ciAssignmentEnabled !== "boolean") {
    return NextResponse.json({ error: "ciAssignmentEnabled must be a boolean" }, { status: 400 })
  }

  let settings = await prisma.automationSetting.findFirst()
  if (!settings) {
    settings = await prisma.automationSetting.create({ data: { ciAssignmentEnabled, updatedBy: admin.id } })
  } else {
    settings = await prisma.automationSetting.update({
      where: { id: settings.id },
      data: { ciAssignmentEnabled, updatedBy: admin.id },
    })
  }

  return NextResponse.json({ ciAssignmentEnabled: settings.ciAssignmentEnabled, updatedAt: settings.updatedAt })
}
