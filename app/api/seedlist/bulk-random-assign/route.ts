import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import prisma from "@/lib/prisma"

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const token = request.cookies.get("auth_token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Only super admins can perform bulk random assignment
    if (payload.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden - Super admin access required" }, { status: 403 })
    }

    const body = await request.json()
    const { amountType, amount, clientIds } = body

    // Locked seeds (client-owned) cannot be randomly assigned
    const unassignedEmails = await prisma.seedEmail.findMany({
      where: {
        AND: [
          { locked: false }, // Only unlocked seeds can be reassigned
          {
            OR: [{ assignedToClient: "RIP" }, { assignedToClient: null }],
          },
        ],
      },
    })

    const totalAvailable = unassignedEmails.length

    if (totalAvailable === 0) {
      return NextResponse.json({
        success: false,
        message: "No unassigned and unlocked seed emails available",
        assigned: 0,
        requested: 0,
      })
    }

    // Calculate how many emails to assign
    let emailsToAssign = totalAvailable
    let requestedAmount = totalAvailable

    if (amountType === "number" && amount) {
      requestedAmount = Number.parseInt(amount)
      emailsToAssign = Math.min(requestedAmount, totalAvailable)
    } else if (amountType === "percentage" && amount) {
      requestedAmount = Math.floor((totalAvailable * Number.parseInt(amount)) / 100)
      emailsToAssign = requestedAmount
    }

    // Get clients to assign to
    let targetClients
    if (clientIds && clientIds.length > 0) {
      targetClients = await prisma.client.findMany({
        where: {
          id: { in: clientIds },
        },
        select: { id: true, name: true },
      })
    } else {
      // Get all clients except RIP
      targetClients = await prisma.client.findMany({
        where: {
          id: { not: "RIP" },
        },
        select: { id: true, name: true },
      })
    }

    if (targetClients.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No valid clients available for assignment",
        assigned: 0,
        requested: requestedAmount,
      })
    }

    // Shuffle the unassigned emails for randomness
    const shuffledEmails = [...unassignedEmails].sort(() => Math.random() - 0.5)
    const emailsToUpdate = shuffledEmails.slice(0, emailsToAssign)

    // Distribute emails using a normal distribution approach
    // Create a weighted distribution that's roughly balanced but not perfectly even
    const distribution = distributeNormally(emailsToAssign, targetClients.length)

    // Assign emails to clients based on distribution
    let emailIndex = 0
    const updates = []

    for (let i = 0; i < targetClients.length; i++) {
      const client = targetClients[i]
      const count = distribution[i]

      for (let j = 0; j < count && emailIndex < emailsToUpdate.length; j++) {
        updates.push(
          prisma.seedEmail.update({
            where: { id: emailsToUpdate[emailIndex].id },
            data: { assignedToClient: client.name },
          }),
        )
        emailIndex++
      }
    }

    // Execute all updates
    await prisma.$transaction(updates)

    const message =
      emailsToAssign < requestedAmount
        ? `Assigned ${emailsToAssign} seed emails (only ${totalAvailable} were available, but ${requestedAmount} were requested)`
        : `Successfully assigned ${emailsToAssign} seed emails`

    return NextResponse.json({
      success: true,
      message,
      assigned: emailsToAssign,
      requested: requestedAmount,
      totalAvailable,
    })
  } catch (error) {
    console.error("Error in bulk random assignment:", error)
    return NextResponse.json({ error: "Failed to randomly assign seed emails" }, { status: 500 })
  }
}

// Helper function to distribute numbers with normal distribution
// Not perfectly even, but roughly balanced
function distributeNormally(total: number, buckets: number): number[] {
  if (buckets === 0) return []
  if (buckets === 1) return [total]

  const distribution: number[] = new Array(buckets).fill(0)
  const baseAmount = Math.floor(total / buckets)
  const remainder = total % buckets

  // Give everyone the base amount
  for (let i = 0; i < buckets; i++) {
    distribution[i] = baseAmount
  }

  // Distribute remainder randomly with some variance
  const indices = Array.from({ length: buckets }, (_, i) => i)
  indices.sort(() => Math.random() - 0.5)

  for (let i = 0; i < remainder; i++) {
    distribution[indices[i]]++
  }

  // Add some additional randomness by redistributing a small amount
  const varianceAmount = Math.floor(total * 0.1) // 10% variance
  for (let i = 0; i < varianceAmount; i++) {
    const fromIndex = Math.floor(Math.random() * buckets)
    const toIndex = Math.floor(Math.random() * buckets)

    if (fromIndex !== toIndex && distribution[fromIndex] > 0) {
      distribution[fromIndex]--
      distribution[toIndex]++
    }
  }

  return distribution
}
