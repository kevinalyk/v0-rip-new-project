import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const mappings = await prisma.ipSenderMapping.findMany({
      orderBy: { ip: "asc" },
    })

    return NextResponse.json(mappings)
  } catch (error) {
    console.error("Error fetching IP sender mappings:", error)
    return NextResponse.json({ error: "Failed to fetch mappings" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || authResult.user?.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { ip, friendlyName, orgName, cidr, reverseDns, notes } = body

    if (!ip?.trim()) {
      return NextResponse.json({ error: "IP address is required" }, { status: 400 })
    }

    // Basic IP validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    if (!ipRegex.test(ip.trim())) {
      return NextResponse.json({ error: "Invalid IP address format" }, { status: 400 })
    }

    const mapping = await prisma.ipSenderMapping.create({
      data: {
        ip: ip.trim(),
        friendlyName: friendlyName?.trim() || null,
        orgName: orgName?.trim() || null,
        cidr: cidr?.trim() || null,
        reverseDns: reverseDns?.trim() || null,
        notes: notes?.trim() || null,
        rdapChecked: false,
      },
    })

    return NextResponse.json(mapping, { status: 201 })
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "A mapping for this IP already exists" }, { status: 409 })
    }
    console.error("Error creating IP sender mapping:", error)
    return NextResponse.json({ error: "Failed to create mapping" }, { status: 500 })
  }
}
