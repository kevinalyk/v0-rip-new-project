import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureDatabaseConnection } from "@/lib/prisma"
import {
  extractSendingIp,
  ensureIpMapping,
  resolveProviderName,
  extractUnsubDomain,
  resolveUnsubProvider,
} from "@/lib/ip-sender-utils"

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
      unsubDomainParsed: 0,
      rdapLookedUp: 0,
      providerAssigned: 0,
      noIpFound: 0,
      errors: 0,
    }

    // ── Step 1: Find campaigns that have rawHeaders but no sendingProvider yet ─
    const unresolved = await prisma.competitiveInsightCampaign.findMany({
      where: {
        rawHeaders: { not: null },
        sendingProvider: null,
        isDeleted: false,
      },
      select: { id: true, rawHeaders: true, sendingIp: true, unsubDomain: true },
      take: 1000,
    })
    console.log(`[resolve-sending-providers] ${unresolved.length} campaigns need provider resolution`)

    // Pre-collect all unique IPs we already know about to avoid redundant RDAP lookups.
    const knownIps = new Set(
      (await prisma.ipSenderMapping.findMany({ select: { ip: true } })).map((r) => r.ip)
    )

    for (const campaign of unresolved) {
      if (!campaign.rawHeaders) continue
      try {
        // ── Extract and store unsub domain (for reference only, not for provider assignment) ──
        const domain = campaign.unsubDomain ?? extractUnsubDomain(campaign.rawHeaders)
        if (domain && !campaign.unsubDomain) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: { unsubDomain: domain },
          })
          stats.unsubDomainParsed++
          // Record in UnsubDomainMapping for admin visibility — but don't use it for provider name
          await resolveUnsubProvider(domain)
        }

        // ── IP / RDAP — sole source of sendingProvider ────────────────────
        let ip = campaign.sendingIp
        if (!ip) {
          ip = extractSendingIp(campaign.rawHeaders)
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

        if (ip) {
          try {
            if (!knownIps.has(ip)) {
              stats.rdapLookedUp++
              knownIps.add(ip)
            }
            const mapping = await ensureIpMapping(ip)
            const providerName = resolveProviderName(mapping)
            await prisma.competitiveInsightCampaign.update({
              where: { id: campaign.id },
              data: { sendingProvider: providerName },
            })
            stats.providerAssigned++
            console.log(`[resolve-sending-providers] Assigned "${providerName}" to campaign ${campaign.id} via rdap:${ip}`)
          } catch (err) {
            console.error(`[resolve-sending-providers] RDAP error for ${ip}:`, err)
            stats.errors++
          }
        }
      } catch (err) {
        console.error(`[resolve-sending-providers] Error on campaign ${campaign.id}:`, err)
        stats.errors++
      }
    }

    console.log(`[resolve-sending-providers] Loop done: ipParsed=${stats.ipParsed} unsubDomainParsed=${stats.unsubDomainParsed} noIpFound=${stats.noIpFound} providerAssigned=${stats.providerAssigned} errors=${stats.errors}`)

    // ── Step 2: Re-resolve any IP mappings not yet checked via RDAP ──────────
    // Covers IPs reset by the admin "Reset & Re-resolve All" action.
    const uncheckedMappings = await prisma.ipSenderMapping.findMany({
      where: { rdapChecked: false },
      select: { ip: true },
      take: 100,
    })

    for (const { ip } of uncheckedMappings) {
      try {
        await prisma.ipSenderMapping.delete({ where: { ip } }).catch(() => {})
        const mapping = await ensureIpMapping(ip)
        const providerName = resolveProviderName(mapping)
        await prisma.competitiveInsightCampaign.updateMany({
          where: { sendingIp: ip, sendingProvider: null },
          data: { sendingProvider: providerName },
        })
        stats.rdapLookedUp++
        stats.providerAssigned++
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
