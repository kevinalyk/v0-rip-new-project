import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"
import prisma from "@/lib/prisma"
import { v4 as uuidv4 } from "uuid"

const ALLOWED_SLUGS = ["rip", "redsparkstrategy"]

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get("auth_token")?.value
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const secret = new TextEncoder().encode(process.env.JWT_SECRET)
    const { payload } = await jwtVerify(token, secret)
    const userId = payload.userId as string

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { client: true },
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Determine client from URL param (super_admin) or user's own client
    const { searchParams } = new URL(request.url)
    const slugParam = searchParams.get("clientSlug")

    let clientSlug: string
    let clientId: string

    if (user.role === "super_admin" && slugParam) {
      clientSlug = slugParam
      const client = await prisma.client.findUnique({ where: { slug: slugParam } })
      if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 })
      clientId = client.id
    } else if (user.client) {
      clientSlug = user.client.slug
      clientId = user.client.id
    } else {
      return NextResponse.json({ error: "No client associated" }, { status: 403 })
    }

    // Only allowed clients
    if (!ALLOWED_SLUGS.includes(clientSlug) && user.role !== "super_admin") {
      return NextResponse.json({ error: "Access denied" }, { status: 403 })
    }

    // Expire any old pending tests for this client (keep history of received ones)
    await prisma.$executeRaw`
      UPDATE "SpamTest"
      SET status = 'expired'
      WHERE "clientId" = ${clientId}
        AND status = 'pending'
        AND "expiresAt" < NOW()
    `

    const mailgunDomain = process.env.MAILGUN_DOMAIN
    if (!mailgunDomain) {
      return NextResponse.json({ error: "Mailgun not configured" }, { status: 500 })
    }

    const shortId = uuidv4().replace(/-/g, "").slice(0, 10)
    const testAddress = `spamtest-${shortId}@${mailgunDomain}`
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h

    const spamTest = await prisma.spamTest.create({
      data: {
        id: uuidv4(),
        clientId,
        clientSlug,
        testAddress,
        status: "pending",
        expiresAt,
      },
    })

    return NextResponse.json({ testAddress, expiresAt, id: spamTest.id })
  } catch (error) {
    console.error("Error generating spam test address:", error)
    return NextResponse.json({ error: "Failed to generate test address" }, { status: 500 })
  }
}
