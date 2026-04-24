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

    // ── Step 1a: Parse sendingIp from campaigns that don't have it yet ─────
    const unparsedIp = await prisma.competitiveInsightCampaign.findMany({
      where: { rawHeaders: { not: null }, sendingIp: null, isDeleted: false },
      select: { id: true, rawHeaders: true },
      take: 2000,
    })
    console.log(`[resolve-sending-providers] Step 1a: ${unparsedIp.length} campaigns need IP parsing`)

    for (const campaign of unparsedIp) {
      if (!campaign.rawHeaders) continue
      const ip = extractSendingIp(campaign.rawHeaders)
      if (ip) {
        await prisma.competitiveInsightCampaign.update({ where: { id: campaign.id }, data: { sendingIp: ip } })
        stats.ipParsed++
      } else {
        stats.noIpFound++
      }
    }
    console.log(`[resolve-sending-providers] Step 1a done: ipParsed=${stats.ipParsed} noIpFound=${stats.noIpFound}`)

    // ── Step 1b: Parse unsubDomain from campaigns that don't have it yet ───
    // This runs separately so existing campaigns (already have sendingIp) also get their unsub domain extracted.
    const unparsedUnsub = await prisma.competitiveInsightCampaign.findMany({
      where: { rawHeaders: { not: null }, unsubDomain: null, isDeleted: false },
      select: { id: true, rawHeaders: true },
      take: 2000,
    })
    console.log(`[resolve-sending-providers] Step 1b: ${unparsedUnsub.length} campaigns need unsub domain parsing`)

    // Diagnostic: log the exact List-Unsubscribe line to debug parsing
    if (unparsedUnsub.length > 0 && unparsedUnsub[0].rawHeaders) {
      const raw = unparsedUnsub[0].rawHeaders
      const normalized = raw.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, " ")
      const lineMatch = normalized.match(/^list-unsubscribe:[ \t]*(.+)$/im)
      console.log(`[resolve-sending-providers] Step 1b List-Unsubscribe line found: ${!!lineMatch}`)
      if (lineMatch) {
        console.log(`[resolve-sending-providers] Step 1b List-Unsubscribe value (first 300): ${lineMatch[1].substring(0, 300)}`)
      }
    }

    let unsubNoHeader = 0
    for (const campaign of unparsedUnsub) {
      if (!campaign.rawHeaders) continue
      const domain = extractUnsubDomain(campaign.rawHeaders)
      if (domain) {
        await prisma.competitiveInsightCampaign.update({ where: { id: campaign.id }, data: { unsubDomain: domain } })
        stats.unsubDomainParsed++
      } else {
        unsubNoHeader++
      }
    }
    console.log(`[resolve-sending-providers] Step 1b done: unsubDomainParsed=${stats.unsubDomainParsed} noUnsubHeader=${unsubNoHeader}`)

    // ── Step 2: 3-tier provider resolution for unresolved campaigns ─────────
    const unresolved = await prisma.competitiveInsightCampaign.findMany({
      where: { sendingProvider: null, isDeleted: false, rawHeaders: { not: null } },
      select: { id: true, sendingIp: true, unsubDomain: true, rawHeaders: true },
      take: 1000,
    })
    console.log(`[resolve-sending-providers] Step 2: ${unresolved.length} campaigns need provider resolution`)

    // Pre-build IP mapping cache (unique IPs only → one RDAP call per IP)
    const uniqueIps = [...new Set(unresolved.map((c) => c.sendingIp).filter(Boolean) as string[])]
    console.log(`[resolve-sending-providers] Step 2: ${uniqueIps.length} unique IPs to look up via RDAP`)
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
        let tier: string | null = null

        // Tier 1: DKIM selector (.s= value)
        if (campaign.rawHeaders) {
          const selector = extractDkimSelector(campaign.rawHeaders)
          if (selector) {
            providerName = await resolveDkimProvider(selector)
            if (providerName) { stats.dkimResolved++; tier = `dkim:${selector}` }
          }
        }

        // Tier 2: Unsubscribe URL domain
        if (!providerName) {
          const domain = campaign.unsubDomain ?? (campaign.rawHeaders ? extractUnsubDomain(campaign.rawHeaders) : null)
          if (domain) {
            providerName = await resolveUnsubProvider(domain)
            if (providerName) { stats.unsubResolved++; tier = `unsub:${domain}` }
            else {
              // Domain was new — log that it was recorded for manual assignment
              console.log(`[resolve-sending-providers] New unsub domain recorded for manual assignment: ${domain} (campaign ${campaign.id})`)
            }
          }
        }

        // Tier 3: IP RDAP (catch-all)
        if (!providerName && campaign.sendingIp) {
          const mapping = ipMappingCache.get(campaign.sendingIp)
          if (mapping) { providerName = resolveProviderName(mapping); tier = `rdap:${campaign.sendingIp}` }
        }

        if (providerName) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: { sendingProvider: providerName },
          })
          stats.providerAssigned++
          console.log(`[resolve-sending-providers] Assigned "${providerName}" to campaign ${campaign.id} via ${tier}`)
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
