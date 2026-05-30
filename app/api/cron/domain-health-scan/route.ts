import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { runDomainHealthScan } from "@/lib/domain-health-scanner"

export const maxDuration = 300
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[cron/domain-health-scan] Starting hourly domain health scan...")

  // Find all verified domains that have at least one domain-health seed assigned
  const domains = await prisma.clientDomain.findMany({
    where: {
      verificationStatus: "verified",
      seedEmails: { some: { domainHealthMode: true, active: true } },
    },
    select: { id: true, domain: true, clientId: true },
  })

  console.log(`[cron/domain-health-scan] Found ${domains.length} verified domains with domain-health seeds`)

  const stats = {
    total: domains.length,
    success: 0,
    failed: 0,
    errors: [] as { domain: string; error: string }[],
  }

  for (const d of domains) {
    try {
      console.log(`[cron/domain-health-scan] Scanning ${d.domain}...`)
      const result = await runDomainHealthScan(d.id, "cron")
      console.log(
        `[cron/domain-health-scan] Done ${d.domain} — ${result.checkCount} checks, ${result.seedEmailCount} seed emails, ${result.ciRowCount} CI rows`,
      )
      stats.success++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[cron/domain-health-scan] Failed ${d.domain}:`, msg)
      stats.errors.push({ domain: d.domain, error: msg })
      stats.failed++
    }
  }

  console.log(
    `[cron/domain-health-scan] Complete — ${stats.success} succeeded, ${stats.failed} failed out of ${stats.total}`,
  )

  return NextResponse.json(stats)
}
