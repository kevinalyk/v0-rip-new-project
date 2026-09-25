import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"
import { scanWinRedInboxes, WINRED_TEST_EMAILS } from "@/lib/winred-inbox-scanner"

// GET: list scanned WinRed testing inbox messages, newest first.
export async function GET(request: Request) {
  const authResult = await verifyAuth(request)
  if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const messages = await prisma.winRedInboxMessage.findMany({
      orderBy: { receivedAt: "desc" },
      take: 500,
    })

    const lastScannedAt = messages.length > 0
      ? messages.reduce((latest, m) => (m.createdAt > latest ? m.createdAt : latest), messages[0].createdAt)
      : null

    return NextResponse.json({
      messages,
      seedEmails: WINRED_TEST_EMAILS,
      lastScannedAt,
    })
  } catch (error) {
    console.error("[admin/winred-inbox] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST: trigger an on-demand scan of the 3 WinRed testing seed inboxes.
export async function POST(request: Request) {
  const authResult = await verifyAuth(request)
  if (!authResult.success || !authResult.user || authResult.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { results, totalSaved } = await scanWinRedInboxes()
    return NextResponse.json({ success: true, totalSaved, results })
  } catch (error: any) {
    console.error("[admin/winred-inbox] Scan error:", error)
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 })
  }
}
