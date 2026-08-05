import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"
import prisma from "@/lib/prisma"

export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const slugParam = searchParams.get("clientSlug")
    const testId = searchParams.get("id") // optional: poll single test

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

    if (testId) {
      // Poll a specific test (used for live status updates)
      const test = await prisma.spamTest.findFirst({
        where: { id: testId, clientId },
      })
      if (!test) return NextResponse.json({ error: "Test not found" }, { status: 404 })
      return NextResponse.json({ test })
    }

    // Return last 20 tests for history
    const tests = await prisma.spamTest.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 20,
    })

    return NextResponse.json({ tests })
  } catch (error) {
    console.error("Error fetching spam test results:", error)
    return NextResponse.json({ error: "Failed to fetch results" }, { status: 500 })
  }
}
