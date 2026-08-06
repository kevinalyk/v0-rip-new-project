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

    const firstNames = [
      "james","john","robert","michael","william","david","richard","joseph","thomas","charles",
      "mary","patricia","jennifer","linda","barbara","elizabeth","susan","jessica","sarah","karen",
      "christopher","daniel","matthew","anthony","mark","donald","steven","paul","andrew","joshua",
      "kevin","brian","george","edward","ronald","timothy","jason","jeffrey","ryan","jacob",
      "gary","nicholas","eric","stephen","jonathan","larry","justin","scott","brandon","benjamin",
    ]
    const lastNames = [
      "smith","johnson","williams","brown","jones","garcia","miller","davis","rodriguez","martinez",
      "hernandez","lopez","gonzalez","wilson","anderson","thomas","taylor","moore","jackson","martin",
      "lee","perez","thompson","white","harris","sanchez","clark","ramirez","lewis","robinson",
      "walker","young","allen","king","wright","scott","torres","nguyen","hill","flores",
      "green","adams","nelson","baker","hall","rivera","campbell","mitchell","carter","roberts",
    ]
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours

    // Retry loop — handles the extremely rare case of a collision
    let spamTest = null
    let attempts = 0
    while (!spamTest && attempts < 5) {
      attempts++
      const first = firstNames[Math.floor(Math.random() * firstNames.length)]
      const last = lastNames[Math.floor(Math.random() * lastNames.length)]
      const num = Math.floor(1000 + Math.random() * 9000)
      const candidate = `${first}.${last}${num}@${mailgunDomain}`

      const existing = await prisma.spamTest.findUnique({ where: { testAddress: candidate } })
      if (existing) continue

      spamTest = await prisma.spamTest.create({
        data: {
          id: uuidv4(),
          clientId,
          clientSlug,
          testAddress: candidate,
          status: "pending",
          expiresAt,
        },
      })
    }

    if (!spamTest) {
      return NextResponse.json({ error: "Failed to generate a unique address, please try again" }, { status: 500 })
    }

    return NextResponse.json({ testAddress, expiresAt, id: spamTest.id })
  } catch (error) {
    console.error("Error generating spam test address:", error)
    return NextResponse.json({ error: "Failed to generate test address" }, { status: 500 })
  }
}
