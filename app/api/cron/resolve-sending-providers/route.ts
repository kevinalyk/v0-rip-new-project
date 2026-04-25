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
      unsubDomainsRecorded: 0,
      noIpFound: 0,
      errors: 0,
    }

    // ── Step 1: Find campaigns that have rawHeaders but no sendingProvider yet ─
    // These are the only campaigns that need any work done.
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

    // Diagnostic: log the first campaign's raw state
    if (unresolved.length > 0) {
      const s = unresolved[0]
      const raw = s.rawHeaders ?? ""
      console.log(`[resolve-sending-providers] Sample campaign ${s.id}: ip=${s.sendingIp} unsub=${s.unsubDomain}`)
      console.log(`[resolve-sending-providers] Sample rawHeaders length: ${raw.length}`)
      console.log(`[resolve-sending-providers] Sample rawHeaders (600): ${raw.substring(0, 600)}`)
      // Show the exact List-Unsubscribe line if present
      const unsubIdx = raw.toLowerCase().indexOf("list-unsubscribe:")
      if (unsubIdx !== -1) {
        console.log(`[resolve-sending-providers] List-Unsubscribe raw (200): ${raw.substring(unsubIdx, unsubIdx + 200)}`)
      } else {
        console.log(`[resolve-sending-providers] No List-Unsubscribe header found in rawHeaders`)
      }
      const dkim = extractDkimSelector(raw)
      const unsub = extractUnsubDomain(raw)
      const ip = extractSendingIp(raw)
      console.log(`[resolve-sending-providers] Sample parsed: dkim=${dkim} unsub=${unsub} ip=${ip}`)
    }

    // Pre-collect all unique IPs we already know about so we can batch RDAP lookups.
    // We only look up IPs that aren't already in IpSenderMapping.
    const knownIps = new Set(
      (await prisma.ipSenderMapping.findMany({ select: { ip: true } })).map((r) => r.ip)
    )

    for (const campaign of unresolved) {
      if (!campaign.rawHeaders) continue
      try {
        let providerName: string | null = null
        let tier: string | null = null

        // ── Tier 1: DKIM selector ──────────────────────────────────────────
        const selector = extractDkimSelector(campaign.rawHeaders)
        if (selector) {
          providerName = await resolveDkimProvider(selector)
          if (providerName) {
            stats.dkimResolved++
            tier = `dkim:${selector}`
          }
        }

        // ── Tier 2: Unsub domain ───────────────────────────────────────────
        if (!providerName) {
          // Extract the unsub domain from rawHeaders if not already stored on the campaign
          const domain = campaign.unsubDomain ?? extractUnsubDomain(campaign.rawHeaders)

          if (domain) {
            // Always write it back to the campaign row if missing
            if (!campaign.unsubDomain) {
              await prisma.competitiveInsightCampaign.update({
                where: { id: campaign.id },
                data: { unsubDomain: domain },
              })
              stats.unsubDomainParsed++
            }

            // Always ensure the domain is recorded in UnsubDomainMapping
            // so it shows up on the admin Sender Providers page for manual assignment.
            // resolveUnsubProvider handles the upsert and returns friendlyName if assigned.
            providerName = await resolveUnsubProvider(domain)
            if (providerName) {
              stats.unsubResolved++
              tier = `unsub:${domain}`
            } else {
              stats.unsubDomainsRecorded++
              console.log(`[resolve-sending-providers] Unsub domain recorded (no provider yet): ${domain}`)
            }
          }
        }

        // ── Tier 3: IP / RDAP ─────────────────────────────────────────────
        if (!providerName) {
          // Parse and store the IP if not already on the campaign
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
              providerName = resolveProviderName(mapping)
              tier = `rdap:${ip}`
            } catch (err) {
              console.error(`[resolve-sending-providers] RDAP error for ${ip}:`, err)
              stats.errors++
            }
          }
        }

        // ── Assign provider if resolved ────────────────────────────────────
        if (providerName) {
          await prisma.competitiveInsightCampaign.update({
            where: { id: campaign.id },
            data: { sendingProvider: providerName },
          })
          stats.providerAssigned++
          console.log(`[resolve-sending-providers] Assigned "${providerName}" to campaign ${campaign.id} via ${tier}`)
        }
      } catch (err) {
        console.error(`[resolve-sending-providers] Error on campaign ${campaign.id}:`, err)
        stats.errors++
      }
    }

    console.log(`[resolve-sending-providers] Loop done: dkimResolved=${stats.dkimResolved} unsubRecorded=${stats.unsubDomainsRecorded} unsubResolved=${stats.unsubResolved} ipParsed=${stats.ipParsed} noIpFound=${stats.noIpFound} providerAssigned=${stats.providerAssigned} errors=${stats.errors}`)

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
