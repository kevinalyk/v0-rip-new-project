import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getAuthenticatedUser, isSystemAdmin } from "@/lib/auth"

export async function GET(request: Request) {
  try {
    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Only system admins can view settings
    const isUserAdmin = await isSystemAdmin(userId)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get("clientId")

    if (clientId && clientId !== "all") {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { dataRetentionDays: true },
      })

      if (!client) {
        return NextResponse.json({ error: "Client not found" }, { status: 404 })
      }

      return NextResponse.json({
        retention_period: client.dataRetentionDays.toString(),
      })
    } else {
      // Get global system settings
      const settings = await prisma.setting.findMany()

      // Convert to key-value object
      const settingsObject = settings.reduce(
        (acc, setting) => {
          acc[setting.key] = setting.value
          return acc
        },
        {} as Record<string, string>,
      )

      return NextResponse.json(settingsObject)
    }
  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    // Check if user is authenticated
    const user = await getAuthenticatedUser(request)
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const userId = user.userId || user.id
    if (!userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    // Only system admins can update settings
    const isUserAdmin = await isSystemAdmin(userId)
    if (!isUserAdmin) {
      return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get("clientId")
    const settings = await request.json()

    if (clientId && clientId !== "all") {
      if (settings.retention_period) {
        await prisma.client.update({
          where: { id: clientId },
          data: {
            dataRetentionDays: Number.parseInt(settings.retention_period),
          },
        })
      }
    } else {
      // Update global system settings
      for (const [key, value] of Object.entries(settings)) {
        await prisma.setting.upsert({
          where: { key },
          update: { value: String(value) },
          create: { key, value: String(value) },
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating settings:", error)
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 })
  }
}
