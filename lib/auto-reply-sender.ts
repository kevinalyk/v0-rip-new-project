/**
 * Auto-reply sender
 *
 * Given a DomainHealthEmailSample row (already fetched by domain-health-scanner.ts — no new
 * IMAP/Graph fetch happens here) + its resolved SeedEmail, decides whether to send a short
 * auto-reply back to the sender, picks a template, and sends it via the same provider-specific
 * transport used elsewhere in the app (nodemailer SMTP for Gmail, Graph sendMail for Outlook).
 *
 * Every attempt — skipped, sent, or failed — is logged so the caller can aggregate stats and so
 * retries never duplicate-send (dedup is enforced via EngagementLog, not just checked here).
 */
import { createTransport } from "nodemailer"
import prisma from "@/lib/prisma"
import { decrypt } from "@/lib/encryption"
import { getServerSettings } from "@/lib/email-connection"
import { sendOutlookReply, shouldUseGraphAPI } from "@/lib/microsoft-graph"
import { classifyForReply } from "@/lib/reply-classifier"

// Automated-sender / bulk-mail signals — never reply to these, to avoid mail loops or
// tripping spam-trap heuristics on the seed mailboxes.
const AUTOMATED_SENDER_RE = /(no-?reply|donotreply|do-not-reply|mailer-daemon|postmaster)/i
const AUTO_SUBMITTED_RE = /^auto-submitted:\s*auto-/im
const BULK_PRECEDENCE_RE = /^precedence:\s*(bulk|list)/im

export type AutoReplyOutcome =
  | { status: "sent" }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string }

// Extracts a bare email address from a header-style string like "Name <email@example.com>".
// Small local util — email-processor.ts's extractEmailAddress is not exported, and this is
// the only other place that needs it, so a tiny duplicate is simpler than reshaping that file.
function extractEmailAddress(str: string): string | null {
  const angleMatch = str.match(/<([^>]+)>/)
  if (angleMatch) return angleMatch[1].trim()
  const bareMatch = str.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)
  return bareMatch ? bareMatch[1].trim() : null
}

async function alreadyReplied(seedEmailId: string, senderAddress: string): Promise<boolean> {
  const existing = await prisma.engagementLog.findFirst({
    where: { seedEmailId, action: "reply", emailSender: senderAddress },
    select: { id: true },
  })
  return !!existing
}

async function pickTemplate(category: string): Promise<string | null> {
  const categoryTemplates = await prisma.autoReplyTemplate.findMany({
    where: { messageType: category, active: true },
    select: { body: true },
  })
  const pool =
    categoryTemplates.length > 0
      ? categoryTemplates
      : await prisma.autoReplyTemplate.findMany({ where: { messageType: null, active: true }, select: { body: true } })

  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)].body
}

async function sendViaGmailSmtp(seedEmail: any, to: string, subject: string, body: string): Promise<void> {
  const serverSettings = getServerSettings(seedEmail.provider)
  if (!serverSettings?.smtp) throw new Error(`No SMTP settings for provider ${seedEmail.provider}`)

  const password =
    seedEmail.twoFactorEnabled && seedEmail.appPassword ? decrypt(seedEmail.appPassword) : decrypt(seedEmail.password)

  const transporter = createTransport({
    host: serverSettings.smtp.host,
    port: serverSettings.smtp.port,
    secure: serverSettings.smtp.secure,
    auth: { user: seedEmail.email, pass: password },
  })

  const replySubject = /^re:/i.test(subject) ? subject : `Re: ${subject}`

  await transporter.sendMail({
    from: seedEmail.email,
    to,
    subject: replySubject,
    text: body,
  })
}

/**
 * Processes a single DomainHealthEmailSample row: safety checks → dedup check → classify →
 * pick template → send → always write an EngagementLog row recording the outcome.
 */
export async function sendAutoReplyForSample(sample: {
  id: string
  seedEmail: string | null
  fromAddress: string | null
  subject: string | null
  emailPreview: string | null
  rawHeadersSnippet: string | null
  receivedAt: Date | null
}): Promise<AutoReplyOutcome> {
  const seedEmailAddress = sample.seedEmail
  if (!seedEmailAddress) return { status: "skipped", reason: "no seed mailbox on sample" }

  const seedEmail = await prisma.seedEmail.findUnique({ where: { email: seedEmailAddress } })
  if (!seedEmail) return { status: "skipped", reason: "seed mailbox not found" }

  const senderAddress = sample.fromAddress ? extractEmailAddress(sample.fromAddress) : null
  const logBase = {
    seedEmailId: seedEmail.id,
    emailSubject: sample.subject,
    emailSender: senderAddress ?? sample.fromAddress,
    emailReceivedAt: sample.receivedAt,
  }

  const logSkip = async (reason: string) => {
    await prisma.engagementLog.create({
      data: { ...logBase, action: "reply", success: false, errorMessage: `skipped: ${reason}` },
    })
    return { status: "skipped" as const, reason }
  }

  // Rail 3: must have a real, parseable sender address
  if (!senderAddress) return logSkip("no parseable sender address")

  // Rail 1: never reply to automated/bulk senders
  if (AUTOMATED_SENDER_RE.test(senderAddress)) return logSkip("automated sender address pattern")
  const headers = sample.rawHeadersSnippet ?? ""
  if (AUTO_SUBMITTED_RE.test(headers) || BULK_PRECEDENCE_RE.test(headers)) {
    return logSkip("Auto-Submitted/Precedence header indicates automated or bulk mail")
  }

  // Rail 2: one reply per sender per seed inbox, forever
  if (await alreadyReplied(seedEmail.id, senderAddress)) {
    return logSkip("already replied to this sender from this seed inbox")
  }

  // Classify + pick a template
  const { category } = await classifyForReply(sample.subject ?? "", sample.emailPreview ?? "")
  const templateBody = await pickTemplate(category)
  if (!templateBody) return logSkip(`no active AutoReplyTemplate for category "${category}" or generic fallback`)

  // Send — Gmail via SMTP, Outlook/Hotmail/Live via Graph. Any other provider is unsupported
  // this pass (per plan scope) and is skipped rather than attempted.
  try {
    if (seedEmail.provider?.toLowerCase() === "gmail") {
      await sendViaGmailSmtp(seedEmail, senderAddress, sample.subject ?? "", templateBody)
    } else if (shouldUseGraphAPI(seedEmail.provider ?? "")) {
      const sent = await sendOutlookReply(seedEmail.id, {
        to: senderAddress,
        subject: sample.subject ?? "",
        body: templateBody,
      })
      if (!sent) throw new Error("Graph sendMail returned failure")
    } else {
      return logSkip(`unsupported provider "${seedEmail.provider}" — only gmail/outlook/hotmail/live are supported`)
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    // Write the failure log but do NOT rethrow — one bad send must never abort the batch.
    await prisma.engagementLog.create({
      data: { ...logBase, action: "reply", success: false, errorMessage },
    })
    return { status: "failed", reason: errorMessage }
  }

  await prisma.engagementLog.create({
    data: { ...logBase, action: "reply", success: true },
  })
  return { status: "sent" }
}
