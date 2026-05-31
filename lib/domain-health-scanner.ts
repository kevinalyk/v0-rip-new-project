/**
 * Domain Health Scanner
 *
 * Model: 1 row per unique email in DomainHealthEmailSample (deduped by messageId).
 *        DNS results stored in DomainHealthDnsResult (upserted per domain).
 *        The report is computed on-the-fly from samples + DNS.
 *
 * On every cron/manual run:
 *  1. Fetch emails from seed inboxes + CI table
 *  2. For each email: extract Message-ID, run compliance checks
 *  3. Upsert into DomainHealthEmailSample — skip if messageId already exists
 *  4. Run DNS checks → upsert DomainHealthDnsResult
 *  5. Return counts (new/skipped)
 */

import prisma from "@/lib/prisma"
import { checkEmailCompliance } from "@/lib/email-compliance-checker"
import { fetchOutlookEmails, shouldUseGraphAPI } from "@/lib/microsoft-graph"
import { decrypt } from "@/lib/encryption"
import { getServerSettings } from "@/lib/email-connection"
import * as Imap from "node-imap"
import dns from "dns/promises"

// Header-derived checks (require email samples)
const HEADER_CHECK_MAP: Record<string, (r: any) => boolean> = {
  spf:               (r) => r.hasSpf,
  dkim:              (r) => r.hasDkim,
  dmarc:             (r) => r.hasDmarc,
  dmarc_align:       (r) => r.hasDmarcAlignment,
  tls:               (r) => r.hasTls,
  one_click_unsub:   (r) => r.hasOneClickUnsubscribeHeaders,
  unsub_link:        (r) => r.hasUnsubscribeLinkInBody,
  from_domain:       (r) => r.hasSingleFromAddress,
  no_fake_reply:     (r) => r.noFakeReplyPrefix,
  valid_from_to:     (r) => r.hasValidFromTo,
  no_hidden_content: (r) => r.noHiddenContent,
  display_name:      (r) => r.displayNameClean,
  arc:               (r) => r.hasArcHeaders,
  valid_message_id:  (r) => r.hasValidMessageId,
}

// Header-only checks — marked manual if no samples found
const HEADER_ONLY_CHECKS = [
  "tls", "one_click_unsub", "unsub_link", "from_domain", "no_fake_reply",
  "valid_from_to", "no_hidden_content", "display_name", "arc",
  "valid_message_id", "dkim", "dmarc_align", "rdns",
] as const

interface ParsedEmail {
  rawHeaders: string
  messageId: string | null
  subject: string
  fromAddress: string
  receivedAt: Date | null
  placement: "inbox" | "spam" | "social" | "promotions" | "other"
  source: "seed" | "ci"
  seedEmail?: string
}

// ─── IMAP fetch ───────────────────────────────────────────────────────────────

function formatDateForImap(date: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

async function fetchEmailsFromSeedIMAP(
  seedEmail: any,
  domain: string,
  daysBack = 30,
): Promise<ParsedEmail[]> {
  return new Promise(async (resolve) => {
    const results: ParsedEmail[] = []
    let resolved = false

    try {
      const password =
        seedEmail.twoFactorEnabled && seedEmail.appPassword
          ? decrypt(seedEmail.appPassword)
          : decrypt(seedEmail.password)

      const serverSettings = getServerSettings(seedEmail.provider)
      if (!serverSettings?.imap) { resolve([]); return }

      const imap = new Imap({
        user: seedEmail.email,
        password,
        host: serverSettings.imap.host,
        port: serverSettings.imap.port,
        tls: serverSettings.imap.tls,
        tlsOptions: { rejectUnauthorized: false, servername: serverSettings.imap.host },
        authTimeout: 20000,
        connTimeout: 20000,
      })

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - daysBack)
      const formattedDate = formatDateForImap(startDate)

      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; try { imap.end() } catch (_) {}; resolve(results) }
      }, 45000)

      imap.once("error", () => {
        if (!resolved) { resolved = true; clearTimeout(timeout); resolve(results) }
      })

      imap.once("ready", () => {
        const provider = seedEmail.provider?.toLowerCase() ?? ""
        const foldersToCheck =
          provider === "gmail"
            ? ["INBOX", "[Gmail]/Promotions", "[Gmail]/Spam"]
            : ["INBOX", "Junk"]

        let folderIndex = 0

        function processNextFolder() {
          if (folderIndex >= foldersToCheck.length) {
            if (!resolved) { resolved = true; clearTimeout(timeout); try { imap.end() } catch (_) {}; resolve(results) }
            return
          }

          const folder = foldersToCheck[folderIndex++]
          const isSpamFolder = folder.toLowerCase().includes("spam") || folder.toLowerCase() === "junk"
          const isPromos = folder.toLowerCase().includes("promo")

          imap.openBox(folder, true, (err) => {
            if (err) { processNextFolder(); return }

            imap.search([["SINCE", formattedDate]], (err, uids) => {
              if (err || !uids || uids.length === 0) { processNextFolder(); return }

              const fetch = imap.fetch(uids.slice(-100), { bodies: ["HEADER", "TEXT"], struct: true })

              fetch.on("message", (msg) => {
                let rawHeaders = ""
                let rawBody = ""

                msg.on("body", (stream, info) => {
                  let buffer = ""
                  stream.on("data", (chunk) => { buffer += chunk.toString("utf8") })
                  stream.once("end", () => {
                    if (info.which === "HEADER") rawHeaders = buffer
                    else rawBody = buffer
                  })
                })

                msg.once("end", () => {
                  if (!rawHeaders) return
                  const fromMatch = rawHeaders.match(/^from:.*@(.+)/im)
                  if (!fromMatch) return
                  const senderDomain = fromMatch[1].trim().toLowerCase().split(">")[0].split(" ")[0]
                  if (!senderDomain.includes(domain.toLowerCase())) return

                  const fromLine    = rawHeaders.match(/^from:\s*(.+)/im)?.[1]?.trim() ?? ""
                  const subjectLine = rawHeaders.match(/^subject:\s*(.+)/im)?.[1]?.trim() ?? ""
                  const dateLine    = rawHeaders.match(/^date:\s*(.+)/im)?.[1]?.trim()
                  const msgIdLine   = rawHeaders.match(/^message-id:\s*(.+)/im)?.[1]?.trim() ?? null
                  const receivedAt  = dateLine ? new Date(dateLine) : null

                  let placement: ParsedEmail["placement"] = "inbox"
                  if (isSpamFolder) placement = "spam"
                  else if (isPromos) placement = "promotions"

                  results.push({
                    rawHeaders: rawHeaders + "\n" + rawBody,
                    messageId: msgIdLine,
                    subject: subjectLine,
                    fromAddress: fromLine,
                    receivedAt: receivedAt && !isNaN(receivedAt.getTime()) ? receivedAt : null,
                    placement,
                    source: "seed",
                    seedEmail: seedEmail.email,
                  })
                })
              })

              fetch.once("end", () => processNextFolder())
              fetch.once("error", () => processNextFolder())
            })
          })
        }

        processNextFolder()
      })

      imap.connect()
    } catch {
      if (!resolved) { resolved = true; resolve(results) }
    }
  })
}

async function fetchEmailsFromSeedGraph(
  seedEmail: any,
  domain: string,
  daysBack = 30,
): Promise<ParsedEmail[]> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  const graphEmails = await fetchOutlookEmails(seedEmail, startDate, 100)

  return graphEmails
    .filter((e) => e.from?.address?.toLowerCase().includes(domain.toLowerCase()) && !!e.rawHeaders)
    .map((e) => ({
      rawHeaders: e.rawHeaders!,
      messageId: e.internetMessageId ?? null,
      subject: e.subject ?? "",
      fromAddress: e.from?.address ?? "",
      receivedAt: e.receivedDateTime ? new Date(e.receivedDateTime) : null,
      placement: e.placement as ParsedEmail["placement"],
      source: "seed" as const,
      seedEmail: seedEmail.email,
    }))
}

// ─── DNS checks ───────────────────────────────────────────────────────────────

async function runDnsChecks(domain: string): Promise<Record<string, { status: "pass" | "fail" | "manual"; value: string; note: string }>> {
  const results: Record<string, { status: "pass" | "fail" | "manual"; value: string; note: string }> = {}

  // SPF
  try {
    const txt = await dns.resolveTxt(domain)
    const spf = txt.flat().find((r) => r.startsWith("v=spf1"))
    results["spf"] = spf
      ? { status: "pass", value: spf, note: `SPF record found: ${spf.slice(0, 80)}` }
      : { status: "fail", value: "", note: `No SPF record found at ${domain}` }
  } catch {
    results["spf"] = { status: "fail", value: "", note: `DNS lookup failed for ${domain}` }
  }

  // DMARC
  try {
    const txt = await dns.resolveTxt(`_dmarc.${domain}`)
    const dmarc = txt.flat().find((r) => r.startsWith("v=DMARC1"))
    results["dmarc"] = dmarc
      ? { status: "pass", value: dmarc, note: `DMARC record found: ${dmarc.slice(0, 80)}` }
      : { status: "fail", value: "", note: `No DMARC record found at _dmarc.${domain}` }
  } catch {
    results["dmarc"] = { status: "fail", value: "", note: `No DMARC record found at _dmarc.${domain}` }
  }

  // MX
  try {
    const mx = await dns.resolveMx(domain)
    results["mx_record"] = mx.length > 0
      ? { status: "pass", value: mx.map((r) => r.exchange).join(", "), note: `MX records: ${mx.map((r) => r.exchange).join(", ")}` }
      : { status: "fail", value: "", note: `No MX records found for ${domain}` }
  } catch {
    results["mx_record"] = { status: "fail", value: "", note: `No MX records found for ${domain}` }
  }

  // BIMI
  try {
    const txt = await dns.resolveTxt(`default._bimi.${domain}`)
    const bimi = txt.flat().find((r) => r.startsWith("v=BIMI1"))
    results["bimi_record"] = bimi
      ? { status: "pass", value: bimi, note: `BIMI record found` }
      : { status: "manual", value: "", note: `No BIMI record at default._bimi.${domain}` }
  } catch {
    results["bimi_record"] = { status: "manual", value: "", note: `No BIMI record found — optional` }
  }

  return results
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runDomainHealthScan(
  clientDomainId: string,
  triggeredBy: "manual" | "cron" = "manual",
): Promise<{ newSamples: number; skippedDuplicates: number; seedEmailCount: number; ciRowCount: number; checkCount: number; scanId: string }> {

  const clientDomain = await prisma.clientDomain.findUnique({
    where: { id: clientDomainId },
    include: { client: { select: { id: true, name: true } } },
  })
  if (!clientDomain) throw new Error(`ClientDomain ${clientDomainId} not found`)

  const domain = clientDomain.domain
  const clientId = clientDomain.clientId

  const seedEmails = await prisma.seedEmail.findMany({
    where: {
      domainHealthMode: true,
      active: true,
      OR: [
        { assignedToClient: clientDomain.client.id },
        { assignedToClient: clientDomain.client.name },
      ],
    },
    select: {
      id: true, email: true, provider: true,
      password: true, appPassword: true, twoFactorEnabled: true,
      accessToken: true, refreshToken: true, oauthConnected: true,
    },
  })

  console.log(`[domain-health-scanner] Scanning ${domain} (${triggeredBy}), ${seedEmails.length} seed(s)`)

  // Collect CI emails
  const ciCampaigns = await prisma.competitiveInsightCampaign.findMany({
    where: {
      clientId: clientDomain.clientId,
      senderEmail: { contains: `@${domain}`, mode: "insensitive" },
      rawHeaders: { not: null },
      isDeleted: false,
    },
    select: { rawHeaders: true, senderEmail: true, subject: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  const ciEmails: ParsedEmail[] = ciCampaigns
    .filter((c) => !!c.rawHeaders)
    .map((c) => {
      const msgIdMatch = c.rawHeaders!.match(/^message-id:\s*(.+)/im)
      return {
        rawHeaders: c.rawHeaders!,
        messageId: msgIdMatch?.[1]?.trim() ?? null,
        subject: c.subject ?? "",
        fromAddress: c.senderEmail ?? "",
        receivedAt: c.createdAt,
        placement: "inbox" as const,
        source: "ci" as const,
      }
    })

  // Fetch live seed inbox emails
  const seedEmails_parsed: ParsedEmail[] = []
  for (const seed of seedEmails) {
    try {
      const emails = shouldUseGraphAPI(seed.provider)
        ? await fetchEmailsFromSeedGraph(seed, domain)
        : await fetchEmailsFromSeedIMAP(seed, domain)
      console.log(`[domain-health-scanner] ${seed.email}: ${emails.length} email(s)`)
      seedEmails_parsed.push(...emails)
    } catch (err) {
      console.error(`[domain-health-scanner] Error fetching ${seed.email}:`, err)
    }
  }

  const allEmails: ParsedEmail[] = [...seedEmails_parsed, ...ciEmails]
  console.log(`[domain-health-scanner] Total: ${seedEmails_parsed.length} seed + ${ciEmails.length} CI = ${allEmails.length} emails`)

  // Upsert each email — skip if messageId already exists for this domain
  let newSamples = 0
  let skippedDuplicates = 0

  // Pre-load existing messageIds for this domain to avoid per-email DB round-trips
  const existingMessageIds = new Set(
    (await prisma.domainHealthEmailSample.findMany({
      where: { clientDomainId, messageId: { not: null } },
      select: { messageId: true },
    })).map((r) => r.messageId!)
  )

  for (const email of allEmails) {
    // Skip duplicates — if we have a messageId and it's already stored, skip
    if (email.messageId && existingMessageIds.has(email.messageId)) {
      skippedDuplicates++
      continue
    }

    let checks: Record<string, boolean> = {}
    try {
      const compliance = checkEmailCompliance({
        senderEmail: email.fromAddress,
        senderName: "",
        subject: email.subject,
        rawHeaders: email.rawHeaders,
        emailContent: "",
      })
      for (const [checkId, getFn] of Object.entries(HEADER_CHECK_MAP)) {
        checks[checkId] = getFn(compliance)
      }
    } catch (err) {
      console.error(`[domain-health-scanner] compliance check error:`, err)
    }

    try {
      await prisma.domainHealthEmailSample.create({
        data: {
          clientDomainId,
          clientId,
          messageId: email.messageId ?? null,
          source: email.source,
          seedEmail: email.seedEmail ?? null,
          fromAddress: email.fromAddress,
          subject: email.subject,
          receivedAt: email.receivedAt,
          placement: email.placement,
          checks,
        },
      })
      if (email.messageId) existingMessageIds.add(email.messageId)
      newSamples++
    } catch (err: any) {
      // Unique constraint violation = another worker beat us to it
      if (err?.code === "P2002") {
        skippedDuplicates++
      } else {
        console.error(`[domain-health-scanner] insert error:`, err)
      }
    }
  }

  // Run DNS checks and upsert into DomainHealthDnsResult
  const dnsResults = await runDnsChecks(domain)
  await prisma.domainHealthDnsResult.upsert({
    where: { clientDomainId },
    create: { clientDomainId, results: dnsResults },
    update: { results: dnsResults, checkedAt: new Date() },
  })

  const totalSamples = await prisma.domainHealthEmailSample.count({ where: { clientDomainId } })

  console.log(`[domain-health-scanner] Done — ${newSamples} new, ${skippedDuplicates} skipped. Total samples: ${totalSamples}`)

  return {
    newSamples,
    skippedDuplicates,
    seedEmailCount: seedEmails_parsed.length,
    ciRowCount: ciEmails.length,
    checkCount: Object.keys(HEADER_CHECK_MAP).length + Object.keys(dnsResults).length,
    scanId: clientDomainId, // no longer a separate scan row — use clientDomainId as the identifier
  }
}

/**
 * Get all email samples + DNS results for a ClientDomain, and compute the
 * aggregated summary on-the-fly.
 */
export async function getLatestScanResults(
  clientDomainId: string,
): Promise<{
  scan: { scannedAt: string; seedEmailCount: number; ciRowCount: number } | null
  results: Record<string, { status: string; value: string | null; note: string | null; source: string; passCount?: number; failCount?: number; total?: number }>
  emailSamples: Array<{ id: string; source: string; seedEmail: string | null; fromAddress: string | null; subject: string | null; receivedAt: Date | null; placement: string; checks: any }>
}> {
  const [emailSamples, dnsRecord] = await Promise.all([
    prisma.domainHealthEmailSample.findMany({
      where: { clientDomainId },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.domainHealthDnsResult.findUnique({
      where: { clientDomainId },
    }),
  ])

  if (emailSamples.length === 0 && !dnsRecord) {
    return { scan: null, results: {}, emailSamples: [] }
  }

  // Aggregate per-email checks into summary
  const voteCounts: Record<string, { pass: number; fail: number }> = {}
  for (const sample of emailSamples) {
    const checks = (sample.checks ?? {}) as Record<string, boolean>
    for (const [checkId, passed] of Object.entries(checks)) {
      if (!voteCounts[checkId]) voteCounts[checkId] = { pass: 0, fail: 0 }
      if (passed) voteCounts[checkId].pass++
      else voteCounts[checkId].fail++
    }
  }

  const results: Record<string, any> = {}

  for (const [checkId, counts] of Object.entries(voteCounts)) {
    const total = counts.pass + counts.fail
    if (total === 0) continue
    results[checkId] = {
      status: counts.pass / total >= 0.6 ? "pass" : "fail",
      passCount: counts.pass,
      failCount: counts.fail,
      total,
      value: `${counts.pass}/${total} emails passed`,
      note: "",
      source: "email_sample",
    }
  }

  // Overlay DNS results
  const dnsResults = (dnsRecord?.results ?? {}) as Record<string, { status: string; value: string; note: string }>
  for (const [checkId, r] of Object.entries(dnsResults)) {
    results[checkId] = {
      status: r.status,
      passCount: r.status === "pass" ? 1 : 0,
      failCount: r.status === "fail" ? 1 : 0,
      total: 1,
      value: r.value,
      note: r.note,
      source: "dns",
    }
  }

  // Mark header-only checks as manual if missing
  for (const checkId of HEADER_ONLY_CHECKS) {
    if (!results[checkId]) {
      results[checkId] = {
        status: "manual",
        passCount: 0, failCount: 0, total: 0,
        value: "",
        note: emailSamples.length === 0
          ? "No email samples — assign seed inboxes or wait for CI data"
          : "Insufficient data",
        source: "email_sample",
      }
    }
  }

  // Build a synthetic "scan" meta object from the samples
  const seedSamples = emailSamples.filter((s) => s.source === "seed")
  const ciSamples   = emailSamples.filter((s) => s.source === "ci")
  const latestAt    = dnsRecord?.checkedAt ?? emailSamples[0]?.receivedAt ?? new Date()

  return {
    scan: {
      scannedAt: latestAt.toISOString(),
      seedEmailCount: seedSamples.length,
      ciRowCount: ciSamples.length,
    },
    results,
    emailSamples,
  }
}
