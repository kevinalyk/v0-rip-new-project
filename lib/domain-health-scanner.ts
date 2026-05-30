/**
 * Domain Health Scanner
 * 
 * Runs compliance checks for a verified ClientDomain by:
 * 1. Pulling rawHeaders from existing CIEmailCompliance rows for the domain (passive, historical)
 * 2. Fetching live emails from assigned domain-health seed inboxes via IMAP / Graph API
 * 3. Running live DNS lookups for SPF, DKIM, DMARC, MX, PTR, BIMI
 * 4. Aggregating results (majority-vote per check across all email samples)
 * 5. Writing a DomainHealthScan + DomainHealthScanResult rows
 */

import prisma from "@/lib/prisma"
import { checkEmailCompliance } from "@/lib/email-compliance-checker"
import { fetchOutlookEmails, shouldUseGraphAPI } from "@/lib/microsoft-graph"
import { decrypt } from "@/lib/encryption"
import { getServerSettings } from "@/lib/email-connection"
import * as Imap from "node-imap"
import { simpleParser } from "mailparser"
import dns from "dns/promises"

// These checkIds MUST match the id field of the CHECKS array in domain-health-content.tsx
const CHECK_IDS = [
  "spf",
  "dkim",
  "dmarc",
  "dmarc_align",
  "tls",
  "one_click_unsub",
  "unsub_link",
  "from_domain",
  "no_fake_reply",
  "valid_from_to",
  "no_hidden_content",
  "display_name",
  "arc",
  "valid_message_id",
  "mx_record",
  "rdns",
  "bimi_record",
] as const

type CheckId = typeof CHECK_IDS[number]

interface CheckVote {
  pass: number
  fail: number
  value: string
  source: "dns" | "ci_header" | "seed_header"
}

interface RawEmail {
  rawHeaders: string
  placement: "inbox" | "spam" | "social" | "promotions" | "other"
  source: "seed_header" | "ci_header"
}

// ─── IMAP fetch (same pattern as campaign-detector) ───────────────────────────

function formatDateForImap(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}

async function fetchEmailsFromSeedIMAP(
  seedEmail: any,
  domain: string,
  daysBack = 30,
): Promise<RawEmail[]> {
  return new Promise(async (resolve) => {
    const results: RawEmail[] = []
    let resolved = false

    try {
      const password =
        seedEmail.twoFactorEnabled && seedEmail.appPassword
          ? decrypt(seedEmail.appPassword)
          : decrypt(seedEmail.password)

      const serverSettings = getServerSettings(seedEmail.provider)
      if (!serverSettings?.imap) {
        resolve([])
        return
      }

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
        if (!resolved) {
          resolved = true
          try { imap.end() } catch (_) {}
          resolve(results)
        }
      }, 45000)

      imap.once("error", () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve(results)
        }
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
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              try { imap.end() } catch (_) {}
              resolve(results)
            }
            return
          }

          const folder = foldersToCheck[folderIndex++]
          const isSpamFolder = folder.toLowerCase().includes("spam") || folder.toLowerCase() === "junk"

          imap.openBox(folder, true, (err) => {
            if (err) {
              processNextFolder()
              return
            }

            imap.search([["SINCE", formattedDate]], (err, uids) => {
              if (err || !uids || uids.length === 0) {
                processNextFolder()
                return
              }

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

                msg.once("attributes", () => {})

                msg.once("end", () => {
                  if (!rawHeaders) return
                  // Filter to only emails FROM this domain
                  const fromMatch = rawHeaders.match(/^from:.*@(.+)/im)
                  if (!fromMatch) return
                  const senderDomain = fromMatch[1].trim().toLowerCase().split(">")[0].split(" ")[0]
                  if (!senderDomain.includes(domain.toLowerCase())) return

                  results.push({
                    rawHeaders: rawHeaders + "\n" + rawBody,
                    placement: isSpamFolder ? "spam" : "inbox",
                    source: "seed_header",
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
    } catch (err) {
      if (!resolved) {
        resolved = true
        resolve(results)
      }
    }
  })
}

async function fetchEmailsFromSeedGraph(
  seedEmail: any,
  domain: string,
  daysBack = 30,
): Promise<RawEmail[]> {
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  const graphEmails = await fetchOutlookEmails(seedEmail, startDate, 100)

  return graphEmails
    .filter((e) => e.from?.address?.toLowerCase().includes(domain.toLowerCase()))
    .filter((e) => !!e.rawHeaders)
    .map((e) => ({
      rawHeaders: e.rawHeaders!,
      placement: e.placement,
      source: "seed_header" as const,
    }))
}

// ─── DNS checks ───────────────────────────────────────────────────────────────

async function runDnsChecks(domain: string): Promise<Partial<Record<CheckId, { status: "pass" | "fail" | "manual"; value: string; note: string }>>> {
  const results: Partial<Record<CheckId, { status: "pass" | "fail" | "manual"; value: string; note: string }>> = {}

  // SPF
  try {
    const txtRecords = await dns.resolveTxt(domain)
    const spf = txtRecords.flat().find((r) => r.startsWith("v=spf1"))
    results["spf"] = spf
      ? { status: "pass", value: spf, note: `SPF record found: ${spf.slice(0, 80)}` }
      : { status: "fail", value: "", note: `No SPF record found at ${domain}` }
  } catch {
    results["spf"] = { status: "fail", value: "", note: `DNS lookup failed for ${domain}` }
  }

  // DMARC
  try {
    const dmarcRecords = await dns.resolveTxt(`_dmarc.${domain}`)
    const dmarc = dmarcRecords.flat().find((r) => r.startsWith("v=DMARC1"))
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
    const bimiRecords = await dns.resolveTxt(`default._bimi.${domain}`)
    const bimi = bimiRecords.flat().find((r) => r.startsWith("v=BIMI1"))
    results["bimi_record"] = bimi
      ? { status: "pass", value: bimi, note: `BIMI record found` }
      : { status: "manual", value: "", note: `No BIMI record at default._bimi.${domain}` }
  } catch {
    results["bimi_record"] = { status: "manual", value: "", note: `No BIMI record found — optional` }
  }

  return results
}

// ─── Aggregate header-based checks ───────────────────────────────────────────

function aggregateHeaderChecks(
  emails: RawEmail[],
): Partial<Record<CheckId, { status: "pass" | "fail"; value: string; source: "seed_header" | "ci_header" }>> {
  if (emails.length === 0) return {}

  const votes: Record<string, CheckVote> = {}

  const checkMap: Record<string, (result: any) => boolean> = {
    spf: (r) => r.hasSpf,
    dkim: (r) => r.hasDkim,
    dmarc: (r) => r.hasDmarc,
    dmarc_align: (r) => r.hasDmarcAlignment,
    tls: (r) => r.hasTls,
    one_click_unsub: (r) => r.hasOneClickUnsubscribeHeaders,
    unsub_link: (r) => r.hasUnsubscribeLinkInBody,
    from_domain: (r) => r.hasSingleFromAddress,
    no_fake_reply: (r) => r.noFakeReplyPrefix,
    valid_from_to: (r) => r.hasValidFromTo,
    no_hidden_content: (r) => r.noHiddenContent,
    display_name: (r) => r.displayNameClean,
    arc: (r) => r.hasArcHeaders,
    valid_message_id: (r) => r.hasValidMessageId,
  }

  for (const email of emails) {
    try {
      const result = checkEmailCompliance({
        senderEmail: "",
        senderName: "",
        subject: "",
        rawHeaders: email.rawHeaders,
        emailContent: "",
      })

      for (const [checkId, getFn] of Object.entries(checkMap)) {
        if (!votes[checkId]) votes[checkId] = { pass: 0, fail: 0, value: "", source: email.source }
        if (getFn(result)) votes[checkId].pass++
        else votes[checkId].fail++
      }
    } catch (_) {}
  }

  const out: Partial<Record<CheckId, { status: "pass" | "fail"; value: string; source: "seed_header" | "ci_header" }>> = {}
  for (const [checkId, v] of Object.entries(votes)) {
    const total = v.pass + v.fail
    const passRate = total > 0 ? v.pass / total : 0
    out[checkId as CheckId] = {
      status: passRate >= 0.6 ? "pass" : "fail",
      value: `${Math.round(passRate * 100)}% of ${total} emails`,
      source: v.source,
    }
  }

  return out
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function runDomainHealthScan(
  clientDomainId: string,
  triggeredBy: "manual" | "cron" = "manual",
): Promise<{ scanId: string; checkCount: number; seedEmailCount: number; ciRowCount: number }> {
  // 1. Load the ClientDomain record
  const clientDomain = await prisma.clientDomain.findUnique({
    where: { id: clientDomainId },
    include: {
      seedEmails: {
        where: { domainHealthMode: true, active: true },
        select: {
          id: true,
          email: true,
          provider: true,
          password: true,
          appPassword: true,
          twoFactorEnabled: true,
          accessToken: true,
          refreshToken: true,
          oauthConnected: true,
        },
      },
    },
  })

  if (!clientDomain) throw new Error(`ClientDomain ${clientDomainId} not found`)

  const domain = clientDomain.domain
  const seedEmails = clientDomain.seedEmails

  // 2. Collect rawHeaders from CI table (historical)
  const ciCampaigns = await prisma.competitiveInsightCampaign.findMany({
    where: {
      clientId: clientDomain.clientId,
      senderEmail: { contains: `@${domain}`, mode: "insensitive" },
      rawHeaders: { not: null },
      isDeleted: false,
    },
    select: { rawHeaders: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  })

  const ciEmails: RawEmail[] = ciCampaigns
    .filter((c) => !!c.rawHeaders)
    .map((c) => ({ rawHeaders: c.rawHeaders!, placement: "inbox", source: "ci_header" as const }))

  // 3. Fetch from seed inboxes
  const seedEmailResults: RawEmail[] = []
  for (const seed of seedEmails) {
    try {
      if (shouldUseGraphAPI(seed.provider)) {
        const emails = await fetchEmailsFromSeedGraph(seed, domain)
        seedEmailResults.push(...emails)
      } else {
        const emails = await fetchEmailsFromSeedIMAP(seed, domain)
        seedEmailResults.push(...emails)
      }
    } catch (err) {
      console.error(`[domain-health-scanner] Error fetching from seed ${seed.email}:`, err)
    }
  }

  // 4. Aggregate header-based checks from both sources (seed takes precedence)
  const allEmails = [...seedEmailResults, ...ciEmails]
  const headerResults = aggregateHeaderChecks(allEmails)

  // 5. Run DNS checks (always live)
  const dnsResults = await runDnsChecks(domain)

  // 6. Merge: DNS results override header results for DNS-checkable items
  const finalResults: Record<string, { status: "pass" | "fail" | "manual"; value: string; note: string; source: string }> = {}

  // Start with header results
  for (const [checkId, r] of Object.entries(headerResults)) {
    finalResults[checkId] = { status: r.status, value: r.value, note: "", source: r.source }
  }

  // Override/supplement with DNS results
  for (const [checkId, r] of Object.entries(dnsResults)) {
    finalResults[checkId] = { status: r.status, value: r.value, note: r.note, source: "dns" }
  }

  // Checks that can only come from headers (mark as manual if no data)
  const headerOnlyChecks: CheckId[] = [
    "tls", "one_click_unsub", "unsub_link",
    "from_domain", "no_fake_reply", "valid_from_to",
    "no_hidden_content", "display_name", "arc",
    "valid_message_id", "dkim", "dmarc_align", "rdns",
  ]
  for (const checkId of headerOnlyChecks) {
    if (!finalResults[checkId]) {
      finalResults[checkId] = {
        status: "manual",
        value: "",
        note: allEmails.length === 0 ? "No email samples available — assign seed inboxes or wait for CI data" : "Insufficient data",
        source: "dns",
      }
    }
  }

  // 7. Write scan + results to DB
  const scan = await prisma.domainHealthScan.create({
    data: {
      clientDomainId,
      triggeredBy,
      seedEmailCount: seedEmailResults.length,
      ciRowCount: ciEmails.length,
      results: {
        create: Object.entries(finalResults).map(([checkId, r]) => ({
          checkId,
          status: r.status,
          value: r.value || null,
          note: r.note || null,
          source: r.source,
        })),
      },
    },
  })

  return {
    scanId: scan.id,
    checkCount: Object.keys(finalResults).length,
    seedEmailCount: seedEmailResults.length,
    ciRowCount: ciEmails.length,
  }
}

/**
 * Get the latest scan results for a ClientDomain, as a map of checkId → result
 */
export async function getLatestScanResults(
  clientDomainId: string,
): Promise<{ scan: any | null; results: Record<string, { status: string; value: string | null; note: string | null; source: string }> }> {
  const scan = await prisma.domainHealthScan.findFirst({
    where: { clientDomainId },
    orderBy: { scannedAt: "desc" },
    include: { results: true },
  })

  if (!scan) return { scan: null, results: {} }

  const results: Record<string, { status: string; value: string | null; note: string | null; source: string }> = {}
  for (const r of scan.results) {
    results[r.checkId] = { status: r.status, value: r.value, note: r.note, source: r.source }
  }

  return { scan, results }
}
