import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// GET /api/campaign-alerts — list all alerts for the current user
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const alerts = await prisma.campaignAlertSubscription.findMany({
    where: { userId: auth.user.id },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ alerts })
}

// POST /api/campaign-alerts — create a new alert
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { name, party, state, office } = body as {
    name?: string
    party?: string
    state?: string
    office?: string
  }

  if (!name?.trim()) {
    return NextResponse.json({ error: "Alert name is required" }, { status: 400 })
  }

  // At least one criteria field must be set
  if (!party && !state && !office) {
    return NextResponse.json(
      { error: "At least one criteria (party, state, or office) is required" },
      { status: 400 },
    )
  }

  const alert = await prisma.campaignAlertSubscription.create({
    data: {
      userId: auth.user.id,
      name: name.trim(),
      party: party || null,
      state: state || null,
      office: office || null,
    },
  })

  return NextResponse.json({ alert }, { status: 201 })
}
