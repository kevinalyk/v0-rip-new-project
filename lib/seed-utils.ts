import prisma from "@/lib/prisma"

/**
 * Determine what a seed email is currently being used for, based on the same
 * signals the rest of the app already relies on to route seeds:
 * - domainHealthMode: used for domain health scans -> "Domain Health"
 * - locked + assigned to the RIP client itself: RIP's own pool used to scan
 *   general political campaigns (see lib/campaign-detector.ts ripSeedEmails) -> "CI"
 * - locked + assigned to any other real client: that client's dedicated
 *   personal-inbox monitoring seed (see app/api/ci/personal/assignments,
 *   app/api/domain-health/seeds) -> "Personal"
 * - anything else (unlocked / unassigned pool seed) has no active use yet -> null
 *
 * RIP never has "Personal" seeds — its own accounts are always "CI" seeds, so
 * a seed assigned to RIP is never auto-labeled "Personal".
 */
export function computeSeedPurpose(seed: {
  assignedToClient: string | null
  domainHealthMode: boolean
  locked: boolean
}): string | null {
  if (seed.domainHealthMode) return "Domain Health"
  if (!seed.locked || !seed.assignedToClient) return null

  const isRip = seed.assignedToClient.toLowerCase() === "rip"
  return isRip ? "CI" : "Personal"
}

/**
 * Unassign all seeds from a cancelled client
 * - User-uploaded seeds: Set assignedToClient to null (keep ownedByClient)
 * - RIP-provided seeds: Return to pool (assignedToClient = null)
 */
export async function unassignClientSeeds(clientId: string): Promise<void> {
  try {
    console.log(`[Seed Utils] Unassigning seeds for cancelled client: ${clientId}`)

    // Get the client to find their name/slug
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { name: true, slug: true },
    })

    if (!client) {
      console.error(`[Seed Utils] Client not found: ${clientId}`)
      return
    }

    // Unassign all seeds assigned to this client
    // This includes both user-uploaded and RIP seeds
    const result = await prisma.seedEmail.updateMany({
      where: {
        assignedToClient: client.name,
      },
      data: {
        assignedToClient: null,
      },
    })

    console.log(`[Seed Utils] Unassigned ${result.count} seeds from client: ${client.name}`)
  } catch (error) {
    console.error(`[Seed Utils] Error unassigning seeds:`, error)
    throw error
  }
}

/**
 * Check if a client can perform write operations
 */
export async function canClientPerformWrites(clientId: string): Promise<boolean> {
  try {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { subscriptionStatus: true },
    })

    return client?.subscriptionStatus === "active"
  } catch (error) {
    console.error(`[Seed Utils] Error checking client write access:`, error)
    return false
  }
}
