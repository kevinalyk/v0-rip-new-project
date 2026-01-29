import { type NextRequest, NextResponse } from "next/server"
import { verifyToken } from "@/lib/auth"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

// GET - Fetch all views for a client
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const clientSlug = searchParams.get("clientSlug")

    if (!clientSlug) {
      return NextResponse.json({ error: "Client slug is required" }, { status: 400 })
    }

    // Get user's client
    const userResult = await sql`
      SELECT "clientId" 
      FROM "User" 
      WHERE id = ${decoded.userId}
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const clientId = userResult[0].clientId

    // Fetch all views for this client
    const views = await sql`
      SELECT 
        id,
        name,
        "filterSettings",
        "createdBy",
        "createdAt",
        "updatedAt"
      FROM "CiView"
      WHERE "clientId" = ${clientId}
      ORDER BY "createdAt" DESC
    `

    return NextResponse.json({ views })
  } catch (error) {
    console.error("Error fetching CI views:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create a new view
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const body = await request.json()
    const { name, filterSettings, clientSlug } = body

    if (!name || !filterSettings || !clientSlug) {
      return NextResponse.json({ error: "Name, filterSettings, and clientSlug are required" }, { status: 400 })
    }

    // Get user's client
    const userResult = await sql`
      SELECT "clientId" 
      FROM "User" 
      WHERE id = ${decoded.userId}
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const clientId = userResult[0].clientId

    // Create new view
    const viewId = crypto.randomUUID()
    const now = new Date()

    await sql`
      INSERT INTO "CiView" (
        id,
        name,
        "clientId",
        "filterSettings",
        "createdBy",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${viewId},
        ${name},
        ${clientId},
        ${JSON.stringify(filterSettings)},
        ${decoded.userId},
        ${now},
        ${now}
      )
    `

    const view = {
      id: viewId,
      name,
      filterSettings,
      createdBy: decoded.userId,
      createdAt: now,
      updatedAt: now,
    }

    return NextResponse.json({ view }, { status: 201 })
  } catch (error) {
    console.error("Error creating CI view:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT - Update an existing view
export async function PUT(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const body = await request.json()
    const { id, name, filterSettings } = body

    if (!id) {
      return NextResponse.json({ error: "View ID is required" }, { status: 400 })
    }

    // Get user's client
    const userResult = await sql`
      SELECT "clientId" 
      FROM "User" 
      WHERE id = ${decoded.userId}
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const clientId = userResult[0].clientId

    // Check if view belongs to user's client
    const viewCheck = await sql`
      SELECT id 
      FROM "CiView" 
      WHERE id = ${id} AND "clientId" = ${clientId}
    `

    if (!viewCheck || viewCheck.length === 0) {
      return NextResponse.json({ error: "View not found or access denied" }, { status: 404 })
    }

    const now = new Date()

    // Build update query dynamically based on what's provided
    const updates: string[] = []
    const values: any[] = []

    if (name !== undefined) {
      updates.push(`name = $${values.length + 1}`)
      values.push(name)
    }

    if (filterSettings !== undefined) {
      updates.push(`"filterSettings" = $${values.length + 1}`)
      values.push(JSON.stringify(filterSettings))
    }

    updates.push(`"updatedAt" = $${values.length + 1}`)
    values.push(now)

    values.push(id)

    await sql.unsafe(
      `
      UPDATE "CiView" 
      SET ${updates.join(", ")}
      WHERE id = $${values.length}
    `,
      values,
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating CI view:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete a view
export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get("auth_token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    if (!decoded?.userId) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const viewId = searchParams.get("id")

    if (!viewId) {
      return NextResponse.json({ error: "View ID is required" }, { status: 400 })
    }

    // Get user's client
    const userResult = await sql`
      SELECT "clientId" 
      FROM "User" 
      WHERE id = ${decoded.userId}
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const clientId = userResult[0].clientId

    // Delete view (only if it belongs to user's client)
    const result = await sql`
      DELETE FROM "CiView" 
      WHERE id = ${viewId} AND "clientId" = ${clientId}
      RETURNING id
    `

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "View not found or access denied" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting CI view:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
