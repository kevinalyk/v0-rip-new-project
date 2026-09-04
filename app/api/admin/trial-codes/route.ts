import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

// GET /api/admin/trial-codes — list all trial codes with redemption counts, newest first.
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const codes = await prisma.trialCode.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { redemptions: true } },
      },
    })

    return NextResponse.json({
      codes: codes.map((c) => ({
        id: c.id,
        code: c.code,
        label: c.label,
        trialLengthDays: c.trialLengthDays,
        active: c.active,
        expiresAt: c.expiresAt,
        createdAt: c.createdAt,
        redemptionCount: c._count.redemptions,
      })),
    })
  } catch (error) {
    console.error("[Admin] Failed to list trial codes:", error)
    return NextResponse.json({ error: "Failed to load trial codes" }, { status: 500 })
  }
}

// POST /api/admin/trial-codes — create a new trial code.
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { code, label, trialLengthDays, expiresAt } = body

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return NextResponse.json({ error: "Code is required" }, { status: 400 })
    }

    const normalizedCode = code.trim().toUpperCase()

    const existing = await prisma.trialCode.findFirst({
      where: { code: { equals: normalizedCode, mode: "insensitive" } },
    })
    if (existing) {
      return NextResponse.json({ error: "A trial code with this value already exists" }, { status: 400 })
    }

    const parsedLength = Number.parseInt(trialLengthDays, 10)
    if (!Number.isFinite(parsedLength) || parsedLength <= 0) {
      return NextResponse.json({ error: "Trial length must be a positive number of days" }, { status: 400 })
    }

    const newCode = await prisma.trialCode.create({
      data: {
        code: normalizedCode,
        label: label && typeof label === "string" && label.trim().length > 0 ? label.trim() : null,
        trialLengthDays: parsedLength,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: authResult.user.id,
      },
    })

    return NextResponse.json({ code: newCode }, { status: 201 })
  } catch (error) {
    console.error("[Admin] Failed to create trial code:", error)
    return NextResponse.json({ error: "Failed to create trial code" }, { status: 500 })
  }
}
