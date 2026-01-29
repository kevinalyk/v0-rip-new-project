import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyToken } from "@/lib/auth"

// Generate a random color from a predefined palette
function generateRandomColor(): string {
  const colors = [
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#FFA07A",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E2",
    "#F8B739",
    "#52B788",
    "#FF8A5B",
    "#9B59B6",
    "#3498DB",
    "#E74C3C",
    "#1ABC9C",
    "#F39C12",
    "#D35400",
    "#C0392B",
    "#8E44AD",
    "#2980B9",
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}

// GET - Fetch all tags for a client
export async function GET(request: Request) {
  try {
    const token = request.headers.get("cookie")?.split("token=")[1]?.split(";")[0]
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    const clientId = decoded.clientId

    // Get all tags for this client
    const tags = await prisma.entityTag.findMany({
      where: { clientId },
      include: {
        entity: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { tagName: "asc" },
    })

    // Group by tag name to get unique tags with their color and usage count
    const tagSummary = tags.reduce((acc: any[], tag) => {
      const existing = acc.find((t) => t.name === tag.tagName)
      if (existing) {
        existing.count++
        existing.entities.push({ id: tag.entity.id, name: tag.entity.name })
      } else {
        acc.push({
          name: tag.tagName,
          color: tag.tagColor,
          count: 1,
          entities: [{ id: tag.entity.id, name: tag.entity.name }],
        })
      }
      return acc
    }, [])

    return NextResponse.json({ tags: tagSummary })
  } catch (error) {
    console.error("Error fetching entity tags:", error)
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 })
  }
}

// POST - Create/add a tag to an entity
export async function POST(request: Request) {
  try {
    const token = request.headers.get("cookie")?.split("token=")[1]?.split(";")[0]
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    const clientId = decoded.clientId
    const userId = decoded.userId

    const { entityId, tagName } = await request.json()

    if (!entityId || !tagName || tagName.length > 50) {
      return NextResponse.json({ error: "Invalid tag name or entity" }, { status: 400 })
    }

    // Check tag limit (5 unique tags per client)
    const existingTags = await prisma.entityTag.findMany({
      where: { clientId },
      distinct: ["tagName"],
      select: { tagName: true },
    })

    // Check if this tag name already exists for this client
    const tagExists = existingTags.some((t) => t.tagName === tagName)

    if (!tagExists && existingTags.length >= 5) {
      return NextResponse.json(
        { error: "Tag limit reached. You can only create 5 unique tags per client." },
        { status: 400 },
      )
    }

    // Get or create tag color (use existing color if tag name already exists)
    let tagColor = generateRandomColor()
    if (tagExists) {
      const existingTag = await prisma.entityTag.findFirst({
        where: { clientId, tagName },
        select: { tagColor: true },
      })
      if (existingTag) {
        tagColor = existingTag.tagColor
      }
    }

    // Create the tag assignment
    const tag = await prisma.entityTag.upsert({
      where: {
        clientId_entityId_tagName: {
          clientId,
          entityId,
          tagName,
        },
      },
      update: {},
      create: {
        clientId,
        entityId,
        tagName,
        tagColor,
        createdBy: userId,
      },
      include: {
        entity: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ tag })
  } catch (error) {
    console.error("Error creating entity tag:", error)
    return NextResponse.json({ error: "Failed to create tag" }, { status: 500 })
  }
}

// DELETE - Remove a tag from an entity
export async function DELETE(request: Request) {
  try {
    const token = request.headers.get("cookie")?.split("token=")[1]?.split(";")[0]
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const decoded = await verifyToken(token)
    const clientId = decoded.clientId

    const { searchParams } = new URL(request.url)
    const entityId = searchParams.get("entityId")
    const tagName = searchParams.get("tagName")

    if (!entityId || !tagName) {
      return NextResponse.json({ error: "Missing entityId or tagName" }, { status: 400 })
    }

    await prisma.entityTag.delete({
      where: {
        clientId_entityId_tagName: {
          clientId,
          entityId,
          tagName,
        },
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting entity tag:", error)
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 })
  }
}
