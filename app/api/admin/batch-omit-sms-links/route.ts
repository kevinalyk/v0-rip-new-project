import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { cookies } from "next/headers"
import { jwtVerify } from "jose"

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "your-secret-key")

// Matches https://... and bare domain links like 76pac.com/9k7Tfrh
const URL_REGEX = /https?:\/\/[^\s]+|(?<![a-zA-Z0-9@])(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/g

async function verifyAdmin() {
  const cookieStore = await cookies()
  const token = cookieStore.get("auth_token")?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    if (payload.role !== "super_admin") return null
    return payload
  } catch {
    return null
  }
}

function omitLinks(message: string): { result: string; count: number } {
  let count = 0
  const result = message.replace(URL_REGEX, () => {
    count++
    return "[Omitted Link]"
  })
  return { result, count }
}

// POST — dry run preview
export async function POST() {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const total = await prisma.smsQueue.count()
    let affected = 0
    let instances = 0

    const batchSize = 500
    let offset = 0

    while (true) {
      const rows = await prisma.smsQueue.findMany({
        select: { id: true, message: true },
        skip: offset,
        take: batchSize,
        orderBy: { id: "asc" },
      })
      if (rows.length === 0) break

      for (const row of rows) {
        if (!row.message) continue
        const { count } = omitLinks(row.message)
        if (count > 0) {
          affected++
          instances += count
        }
      }

      offset += batchSize
      if (rows.length < batchSize) break
    }

    return NextResponse.json({ total, affected, instances })
  } catch (error) {
    console.error("[batch-omit-sms-links] Preview error:", error)
    return NextResponse.json({ error: "Preview failed" }, { status: 500 })
  }
}

// PUT — execute permanently
export async function PUT() {
  const admin = await verifyAdmin()
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    let processed = 0
    let modified = 0
    let instances = 0

    const batchSize = 100
    let offset = 0

    while (true) {
      const rows = await prisma.smsQueue.findMany({
        select: { id: true, message: true },
        skip: offset,
        take: batchSize,
        orderBy: { id: "asc" },
      })
      if (rows.length === 0) break

      for (const row of rows) {
        processed++
        if (!row.message) continue
        const { result, count } = omitLinks(row.message)
        if (count > 0) {
          await prisma.smsQueue.update({
            where: { id: row.id },
            data: { message: result },
          })
          modified++
          instances += count
        }
      }

      offset += batchSize
      if (rows.length < batchSize) break
    }

    return NextResponse.json({ success: true, processed, modified, instances })
  } catch (error) {
    console.error("[batch-omit-sms-links] Execute error:", error)
    return NextResponse.json({ error: "Execution failed" }, { status: 500 })
  }
}
