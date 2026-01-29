import prisma from "@/lib/prisma"

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
