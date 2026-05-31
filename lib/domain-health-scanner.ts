/**
 * Domain Health Scanner
 *
 * For each scan:
 * 1. Fetches individual emails from seed inboxes (IMAP / Graph) and CI historical data
 * 2. Runs compliance checks on EACH email individually → saves as DomainHealthEmailSample rows
 * 3. Runs live DNS checks (SPF, DMARC, MX, BIMI)
 * 4. Aggregates per-email results + DNS into a summary stored on DomainHealthScan
 */

import prisma from "@/lib/prisma"
import { checkEmailCompliance } from "@/lib/email-compliance-checker"
import { fetchOutlookEmails, shouldUseGraphAPI } from "@/lib/microsoft-graph"
import { decrypt } from "@/lib/encryption"
import { getServerSettings } from "@/lib/email-connection"
import * as Imap from "node-imap"
import { simpleParser } from "mailparser"
import dns from "dns/promises"

const CHECK_IDS = [
  "spf", "dkim", "dmarc", "dmarc_align", "tls",
  "one_click_unsub", "unsub_link", "from_domain", "no_fake_reply",
  "valid_from_to", "no_hidden_content", "display_name", "arc",
  "valid_message_id", "mx_record", "rdns", "bimi_record",
] as const

type CheckId = typeof CHECK_IDS[number]

// Header-derived checks (require email samples)
const HEADER_CHECK_MAP: Record<string, (r: any) => boolean> = {
  spf:             (r) => r.hasSpf,
  dkim:            (r) => r.hasDkim,
  dmarc:           (r) => r.hasDmarc,
  dmarc_align:     (r) => r.hasDmarcAlignment,
  tls:             (r) => r.hasTls,
  one_click_unsub: (r) => r.hasOneClickUnsubscribeHeaders,
  unsub_link:      (r) => r.hasUnsubscribeLinkInBody,
  from_domain:     (r) => r.hasSingleFromAddress,
  no_fake_reply:   (r) => r.noFakeReplyPrefix,
  valid_from_to:   (r) => r.hasValidFromTo,
  no_hidden_content: (r) => r.noHiddenContent,
  display_name:    (r) => r.displayNameClean,
  arc:             (r) => r.hasArcHeaders,
  valid_message_id:(r) => r.hasValidMessageId,
}

// DNS-only checks (no email samples needed)
const DNS_ONLY_CHECKS: CheckId[] = ["spf", "dmarc", "mx_record", "bimi_record"]

// Header-only checks (mark manual if no samples)
const HEADER_ONLY_CHECKS: CheckId[] = [
  "tls", "one_click_unsub", "unsub_link", "from_domain", "no_fake_reply",
  "valid_from_to", "no_hidden_content", "display_name", "arc",
  "valid_message_id", "dkim", "dmarc_align", "rdns",
]

interface ParsedEmail {
  rawHeaders: string
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

                  // Extract from address and subject from headers
                  const fromLine = rawHeaders.match(/^from:\s*(.+)/im)?.[1]?.trim() ?? ""
                  const subjectLine = rawHeaders.match(/^subject:\s*(.+)/im)?.[1]?.trim() ?? ""
                  const dateLine = rawHeaders.match(/^date:\s*(.+)/im)?.[1]?.trim()
                  const receivedAt = dateLine ? new Date(dateLine) : null

                  let placement: ParsedEmail["placement"] = "inbox"
                  if (isSpamFolder) placement = "spam"
                  else if (isPromos) placement = "promotions"

                  results.push({
                    rawHeaders: rawHeaders + "\n" + rawBody,
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
      subject: e.subject ?? "",
      fromAddress: e.from?.address ?? "",
      receivedAt: e.receivedDateTime ? new Date(e.receivedDateTime) : null,
      placement: e.placement as ParsedEmail["placement"],
      source: "seed" as const,
      seedEmail: seedEmail.email,
    }))
}

// ─── DNS checks ───────────────────────────────────────────────────────────────

async function runDnsChecks(domain: string): Promise<Partial<Record<CheckId, { status: "pass" | "fail" | "manual"; value: string; note: string }>>> {
  const results: Partial<Record<CheckId, { status: "pass" | "fail" | "manual"; value: string; note: string }>> = {}

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
): Promise<{ scanId: string; checkCount: number; seedEmailCount: number; ciRowCount: number }> {

  // 1. Load the ClientDomain record
  const clientDomain = await prisma.clientDomain.findUnique({
    where: { id: clientDomainId },
    include: { client: { select: { id: true, name: true } } },
  })
  if (!clientDomain) throw new Error(`ClientDomain ${clientDomainId} not found`)

  const domain = clientDomain.domain

  // Seeds scoped to the client — any seed with domainHealthMode=true serves all client domains
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

  console.log(`[domain-health-scanner] Starting scan for domain: ${domain} (id: ${clientDomainId}), triggeredBy: ${triggeredBy}`)
  console.log(`[domain-health-scanner] Found ${seedEmails.length} domain-health seed(s):`, seedEmails.map((s) => s.email))

  // 2. Collect from CI table (historical raw headers)
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
    .map((c) => ({
      rawHeaders: c.rawHeaders!,
      subject: c.subject ?? "",
      fromAddress: c.senderEmail ?? "",
      receivedAt: c.createdAt,
      placement: "inbox" as const,
      source: "ci" as const,
    }))

  console.log(`[domain-health-scanner] CI historical emails for @${domain}: ${ciEmails.length}`)

  // 3. Fetch live emails from seed inboxes
  const seedEmails_parsed: ParsedEmail[] = []
  for (const seed of seedEmails) {
    const method = shouldUseGraphAPI(seed.provider) ? "Graph API" : "IMAP"
    console.log(`[domain-health-scanner] Fetching seed ${seed.email} via ${method}`)
    try {
      const emails = shouldUseGraphAPI(seed.provider)
        ? await fetchEmailsFromSeedGraph(seed, domain)
        : await fetchEmailsFromSeedIMAP(seed, domain)
      console.log(`[domain-health-scanner] ${seed.email}: found ${emails.length} email(s) from @${domain}`)
      seedEmails_parsed.push(...emails)
    } catch (err) {
      console.error(`[domain-health-scanner] Error fetching ${seed.email}:`, err)
    }
  }

  const allEmails: ParsedEmail[] = [...seedEmails_parsed, ...ciEmails]
  console.log(`[domain-health-scanner] Total email samples: ${seedEmails_parsed.length} seed + ${ciEmails.length} CI = ${allEmails.length}`)

  // 4. Create the scan record first (so we can attach email samples to it)
  const scan = await prisma.domainHealthScan.create({
    data: {
      clientDomainId,
      triggeredBy,
      seedEmailCount: seedEmails_parsed.length,
      ciRowCount: ciEmails.length,
      summary: {}, // filled in after aggregation
    },
  })

  // 5. Save each individual email as a DomainHealthEmailSample with its own check results
  const perEmailResults: Array<Record<string, boolean>> = []

  for (const email of allEmails) {
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
      console.error(`[domain-health-scanner] checkEmailCompliance error:`, err)
    }

    await prisma.domainHealthEmailSample.create({
      data: {
        scanId: scan.id,
        source: email.source,
        seedEmail: email.seedEmail ?? null,
        fromAddress: email.fromAddress,
        subject: email.subject,
        receivedAt: email.receivedAt,
        placement: email.placement,
        checks,
      },
    })

    perEmailResults.push(checks)
  }

  // 6. Aggregate per-email results into summary
  const voteCounts: Record<string, { pass: number; fail: number }> = {}
  for (const checkId of Object.keys(HEADER_CHECK_MAP)) {
    voteCounts[checkId] = { pass: 0, fail: 0 }
  }
  for (const checks of perEmailResults) {
    for (const [checkId, passed] of Object.entries(checks)) {
      if (!voteCounts[checkId]) voteCounts[checkId] = { pass: 0, fail: 0 }
      if (passed) voteCounts[checkId].pass++
      else voteCounts[checkId].fail++
    }
  }

  const summary: Record<string, { status: "pass" | "fail" | "manual"; passCount: number; failCount: number; total: number; value: string; note: string; source: string }> = {}

  for (const [checkId, counts] of Object.entries(voteCounts)) {
    const total = counts.pass + counts.fail
    if (total === 0) continue
    const passRate = counts.pass / total
    summary[checkId] = {
      status: passRate >= 0.6 ? "pass" : "fail",
      passCount: counts.pass,
      failCount: counts.fail,
      total,
      value: `${counts.pass}/${total} emails passed`,
      note: "",
      source: "email_sample",
    }
  }

  // 7. Run DNS checks and override/supplement summary
  console.log(`[domain-health-scanner] Running DNS checks for ${domain}...`)
  const dnsResults = await runDnsChecks(domain)
  for (const [checkId, r] of Object.entries(dnsResults)) {
    summary[checkId] = {
      status: r.status,
      passCount: r.status === "pass" ? 1 : 0,
      failCount: r.status === "fail" ? 1 : 0,
      total: 1,
      value: r.value,
      note: r.note,
      source: "dns",
    }
  }

  // 8. Mark header-only checks as manual if no samples
  for (const checkId of HEADER_ONLY_CHECKS) {
    if (!summary[checkId]) {
      summary[checkId] = {
        status: "manual",
        passCount: 0, failCount: 0, total: 0,
        value: "",
        note: allEmails.length === 0
          ? "No email samples — assign seed inboxes or wait for CI data"
          : "Insufficient data",
        source: "email_sample",
      }
    }
  }

  // 9. Update the scan with the completed summary
  await prisma.domainHealthScan.update({
    where: { id: scan.id },
    data: { summary },
  })

  console.log(`[domain-health-scanner] Scan complete. scanId: ${scan.id}, ${allEmails.length} email samples, ${Object.keys(summary).length} checks`)

  return {
    scanId: scan.id,
    checkCount: Object.keys(summary).length,
    seedEmailCount: seedEmails_parsed.length,
    ciRowCount: ciEmails.length,
  }
}

/**
 * Get the latest scan summary + per-email samples for a ClientDomain
 */
export async function getLatestScanResults(
  clientDomainId: string,
): Promise<{
  scan: any | null
  results: Record<string, { status: string; value: string | null; note: string | null; source: string; passCount?: number; failCount?: number; total?: number }>
  emailSamples: Array<{ id: string; source: string; seedEmail: string | null; fromAddress: string | null; subject: string | null; receivedAt: Date | null; placement: string; checks: any }>
}> {
  const scan = await prisma.domainHealthScan.findFirst({
    where: { clientDomainId },
    orderBy: { scannedAt: "desc" },
    include: {
      emailSamples: {
        orderBy: { receivedAt: "desc" },
      },
    },
  })

  if (!scan) return { scan: null, results: {}, emailSamples: [] }

  const results = (scan.summary ?? {}) as Record<string, { status: string; value: string | null; note: string | null; source: string; passCount?: number; failCount?: number; total?: number }>

  return {
    scan,
    results,
    emailSamples: scan.emailSamples ?? [],
  }
}
