import prisma from "@/lib/prisma"
import { MobileAuthError } from "@/lib/mobile-auth"

export async function listAlerts(userId: string) {
  return prisma.campaignAlertSubscription.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  })
}

export async function createAlert(
  userId: string,
  input: { name?: string; party?: string; state?: string; office?: string },
) {
  const name = input.name?.trim()
  if (!name) {
    throw new MobileAuthError(400, "INVALID_BODY", "Alert name is required")
  }
  if (!input.party && !input.state && !input.office) {
    throw new MobileAuthError(400, "INVALID_BODY", "At least one criteria (party, state, or office) is required")
  }

  return prisma.campaignAlertSubscription.create({
    data: {
      userId,
      name,
      party: input.party || null,
      state: input.state || null,
      office: input.office || null,
    },
  })
}

export async function deleteAlert(userId: string, alertId: string) {
  const existing = await prisma.campaignAlertSubscription.findUnique({
    where: { id: alertId },
    select: { userId: true },
  })
  if (!existing) {
    throw new MobileAuthError(404, "ALERT_NOT_FOUND", "Alert not found")
  }
  if (existing.userId !== userId) {
    throw new MobileAuthError(403, "FORBIDDEN", "You do not have access to this alert")
  }
  await prisma.campaignAlertSubscription.delete({ where: { id: alertId } })
}
