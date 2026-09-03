import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { sendAutoReplyForSample } from "@/lib/auto-reply-sender"

export const maxDuration = 300
export const runtime = "nodejs"

// Runs 15 minutes after domain-health-scan (which runs at the top of every hour) so this cron
// always trails it — it reads DomainHealthEmailSample rows the scan just wrote, rather than
// opening any new IMAP/Graph connections to fetch mail itself.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[cron/auto-reply-verified-domains] Starting auto-reply pass...")

  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

  const samples = await prisma.domainHealthEmailSample.findMany({
    where: {
      receivedAt: { gte: twoHoursAgo },
      source: "seed",
      seedEmail: { not: null },
      clientDomain: { status: "verified" },
    },
    select: {
      id: true,
      seedEmail: true,
      fromAddress: true,
      subject: true,
      emailPreview: true,
      rawHeadersSnippet: true,
      receivedAt: true,
    },
  })

  console.log(`[cron/auto-reply-verified-domains] Found ${samples.length} recent verified-domain sample(s) to evaluate`)

  const stats = {
    total: samples.length,
    replied: 0,
    skipped: 0,
    failed: 0,
    errors: [] as { sampleId: string; error: string }[],
  }

  for (const sample of samples) {
    try {
      const outcome = await sendAutoReplyForSample(sample)
      if (outcome.status === "sent") stats.replied++
      else if (outcome.status === "skipped") stats.skipped++
      else {
        stats.failed++
        stats.errors.push({ sampleId: sample.id, error: outcome.reason })
      }
    } catch (err) {
      // Belt-and-suspenders — sendAutoReplyForSample already catches its own errors, but a
      // single unexpected throw here must still never abort the rest of the batch.
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/auto-reply-verified-domains] Unexpected error for sample ${sample.id}:`, msg)
      stats.failed++
      stats.errors.push({ sampleId: sample.id, error: msg })
    }
  }

  console.log(
    `[cron/auto-reply-verified-domains] Complete — ${stats.replied} replied, ${stats.skipped} skipped, ${stats.failed} failed out of ${stats.total}`,
  )

  return NextResponse.json(stats)
}
