import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureDatabaseConnection } from "@/lib/prisma"
import { extractSendingIp, ensureIpMapping, resolveProviderName } from "@/lib/ip-sender-utils"

export const runtime = "nodejs"
// Allow up to 5 minutes — RDAP lookups for many new IPs can take time
export const maxDuration = 300

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization")
    const isVercelCron = request.headers.get("user-agent")?.includes("vercel-cron")

    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const dbConnected = await ensureDatabaseConnection()
    if (!dbConnected) {
      return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
    }

    const stats = {
      ipParsed: 0,
      ipAlreadySet: 0,
      rdapLookedUp: 0,
      providerAssigned: 0,
      noIpFound: 0,
      errors: 0,
    }

    // ── Step 1: Parse sendingIp from rawHeaders for emails that don't have it yet ──
    const unparsed = await prisma.competitiveInsightCampaign.findMany({
      where: {
        rawHeaders: { not: null },
        sendingIp: null,
        isDeleted: false,
      },
      select: { id: true, rawHeaders: true },
      take: 2000,
    })

    for (const campaign of unparsed) {
      if (!campaign.rawHeaders) continue
      const ip = extractSendingIp(campaign.rawHeaders)
      if (ip) {
        await prisma.competitiveInsightCampaign.update({
          where: { id: campaign.id },
          data: { sendingIp: ip },
        })
        stats.ipParsed++
      } else {
        stats.noIpFound++
      }
    }

    // ── Step 2: For emails that have a sendingIp but no sendingProvider, resolve it ──
    const unresolved = await prisma.competitiveInsightCampaign.findMany({
      where: {
        sendingIp: { not: null },
        sendingProvider: null,
        isDeleted: false,
      },
      select: { id: true, sendingIp: true },
      take: 1000,
    })

    // Collect unique IPs so we only do one RDAP lookup per IP even if many emails share it
    const uniqueIps = [...new Set(unresolved.map((c) => c.sendingIp as string))]

    const ipMappingCache = new Map<string, { friendlyName: string | null; orgName: string | null; reverseDns: string | null; ip: string }>()

    for (const ip of uniqueIps) {
      try {
        const mapping = await ensureIpMapping(ip)
        ipMappingCache.set(ip, mapping)
        if (!ipMappingCache.get(ip)?.orgName && !ipMappingCache.get(ip)?.reverseDns) {
          // RDAP returned nothing useful — still cached so we don't retry every hour
        }
        stats.rdapLookedUp++
      } catch (err) {
        console.error(`[resolve-sending-providers] RDAP error for ${ip}:`, err)
        stats.errors++
      }
    }

    // Batch update campaigns with resolved provider name
    for (const campaign of unresolved) {
      const ip = campaign.sendingIp as string
      const mapping = ipMappingCache.get(ip)
      if (!mapping) continue

      const providerName = resolveProviderName(mapping)
      await prisma.competitiveInsightCampaign.update({
        where: { id: campaign.id },
        data: { sendingProvider: providerName },
      })
      stats.providerAssigned++
    }

    // ── Step 3: Re-check any emails whose provider is the raw IP (RDAP may have failed before) ──
    // Only do this for IPs that haven't been checked via RDAP yet
    const uncheckedMappings = await prisma.ipSenderMapping.findMany({
      where: { rdapChecked: false },
      select: { ip: true },
      take: 50,
    })

    for (const { ip } of uncheckedMappings) {
      try {
        await ensureIpMapping(ip)
        stats.rdapLookedUp++
      } catch {
        stats.errors++
      }
    }

    return NextResponse.json({
      success: true,
      ...stats,
    })
  } catch (error) {
    console.error("[resolve-sending-providers] Fatal error:", error)
    return NextResponse.json(
      { error: "Cron failed", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}
