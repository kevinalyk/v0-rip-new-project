import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getUserFromRequest } from "@/lib/auth"

// Matches https://... URLs and bare domain URLs like 76pac.com/9k7Tfrh
// Excludes email addresses (foo@domain.com) via negative lookbehind on @
const URL_REGEX =
  /https?:\/\/[^\s]+|(?<![a-zA-Z0-9@])(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s]*)?/g

function redactLinks(message: string): string {
  return message.replace(URL_REGEX, "[Omitted Link]")
}

export async function POST(request: Request) {
  try {
    const user = await getUserFromRequest(request)
    if (!user || user.role !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const { batchSize = 500, dryRun = false } = await request.json().catch(() => ({}))

    // Fetch all SMS messages that still contain URLs
    const allSms = await prisma.smsQueue.findMany({
      select: { id: true, message: true },
    })

    let updated = 0
    let skipped = 0
    const samples: Array<{ id: string; before: string; after: string }> = []

    const toUpdate: Array<{ id: string; redacted: string }> = []

    for (const sms of allSms) {
      if (!sms.message) { skipped++; continue }
      const redacted = redactLinks(sms.message)
      if (redacted === sms.message) { skipped++; continue }

      toUpdate.push({ id: sms.id, redacted })
      if (samples.length < 10) {
        samples.push({ id: sms.id, before: sms.message, after: redacted })
      }
    }

    if (!dryRun) {
      // Process in batches to avoid overwhelming the DB
      for (let i = 0; i < toUpdate.length; i += batchSize) {
        const batch = toUpdate.slice(i, i + batchSize)
        await Promise.all(
          batch.map(({ id, redacted }) =>
            prisma.smsQueue.update({ where: { id }, data: { message: redacted } })
          )
        )
        updated += batch.length
      }
    } else {
      updated = toUpdate.length
    }

    return NextResponse.json({
      success: true,
      dryRun,
      total: allSms.length,
      updated,
      skipped,
      samples,
    })
  } catch (error) {
    console.error("[redact-sms-links] Error:", error)
    return NextResponse.json(
      { error: "Failed to redact SMS links", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
