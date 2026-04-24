import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { ensureDatabaseConnection } from "@/lib/prisma"
import {
  extractSendingIp,
  ensureIpMapping,
  resolveProviderName,
  extractDkimSelector,
  resolveDkimProvider,
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
      dkimResolved: 0,
      unsubResolved: 0,
      rdapLookedUp: 0,
      providerAssigned: 0,
      noIpFound: 0,
      errors: 0,
    }

    // ── Step 1: Parse sendingIp + unsubDomain from rawHeaders ──────────────
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
      const unsubDomain = extractUnsubDomain(campaign.rawHeaders)
      const updates: Record<string, string | null> = {}
      if (ip) { updates.sendingIp = ip; stats.ipParsed++ }
      else stats.noIpFound++
      if (unsubDomain) { updates.unsubDomain = unsubDomain; stats.unsubDomainParsed++ }
      if (Object.keys(updates).length > 0) {
        await prisma.competitiveInsightCampaign.update({ where: { id: campaign.id }, data: updates })
      }
    }

    // ── Step 2: 3-tier provider resolution for unresolved campaigns ─────────
    // Fetch campaigns that need a provider. Include rawHeaders for DKIM + unsub parsing.
    const unresolved = await prisma.competitiveInsightCampaign.findMany({
      where: { sendingProvider: null, isDeleted: false, rawHeaders: { not: null } },
      select: { id: true, sendingIp: true, unsubDomain: true, rawHeaders: true },
      take: 1000,
    })

    // Pre-build IP mapping cache (unique IPs only → one RDAP call per IP)
    const uniqueIps = [...new Set(unresolved.map((c) => c.sendingIp).filter(Boolean) as string[])]
    const ipMappingCache = new Map<string, { friendlyName: string | null; orgName: string | null; reverseDns: string | null; ip: string }>()
    for (const ip of uniqueIps) {
      try {
        const mapping = await ensureIpMapping(ip)
        ipMappingCache.set(ip, mapping)
        stats.rdapLookedUp++
      } catch (err) {
        console.error(`[resolve-sending-providers] RDAP error for ${ip}:`, err)
        stats.errors++
      }
    }

    for (const campaign of unresolved) {
      try {
        let providerName: string | null = null

        // Tier 1: DKIM selector (.s= value)
        if (!providerName && campaign.rawHeaders) {
          const selector = extractDkimSelector(campaign.rawHeaders)
          if (selector) {
            providerName = await resolveDkimProvider(selector)
            if (providerName) stats.dkimResolved++
          }
        }

        // Tier 2: Unsubscribe URL domain
        if (!providerName) {
          const domain = campaign.unsubDomain ?? (campaign.rawHeaders ? extractUnsubDomain(campaign.rawHeaders) : null)
          if (domain) {
            providerName = await resolveUnsubProvider(domain)
            if (providerName) stats.unsubResolved++
          }
        }

        // Tier 3: IP RDAP (catch-all)
        if (!providerName && campaign.sendingIp) {
          const mapping = ipMappingCache.get(campaign.sendingIp)
          if (mapping) providerName = resolveProviderName(mapping)
        }

        if (providerName) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: { sendingProvider: providerName },
          })
          stats.providerAssigned++
        }
      } catch (err) {
        console.error(`[resolve-sending-providers] Error resolving campaign ${campaign.id}:`, err)
        stats.errors++
      }
    }

    // ── Step 3: Re-resolve any IP mappings not yet checked via RDAP ──
    // This covers: (a) newly added IPs with rdapChecked=false, and
    // (b) IPs reset by the admin "Reset & Re-resolve All" action
    const uncheckedMappings = await prisma.ipSenderMapping.findMany({
      where: { rdapChecked: false },
      select: { ip: true },
      take: 100,
    })

    for (const { ip } of uncheckedMappings) {
      try {
        // Delete the stale row so ensureIpMapping creates a fresh one with the
        // corrected lookupRdap logic (most-specific RDAP network block)
        await prisma.ipSenderMapping.delete({ where: { ip } }).catch(() => {})
        const mapping = await ensureIpMapping(ip)

        // Re-assign sendingProvider on all campaigns that use this IP and
        // currently have no provider set (cleared by the re-resolve action)
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
