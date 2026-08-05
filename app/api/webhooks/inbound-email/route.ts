import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { v4 as uuidv4 } from "uuid"
import crypto from "crypto"

// Verify Mailgun webhook signature
function verifyMailgunWebhook(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY

  if (!signingKey) {
    console.error("MAILGUN_WEBHOOK_SIGNING_KEY environment variable is not set")
    return false
  }

  const encodedToken = crypto.createHmac("sha256", signingKey).update(timestamp.concat(token)).digest("hex")

  return encodedToken === signature
}

// ─── Spam Test helpers ────────────────────────────────────────────────────────

function parseAuthResults(fields: Record<string, string>) {
  const authHeader =
    fields["Authentication-Results"] ||
    fields["authentication-results"] ||
    fields["X-Mailgun-Spf"] ||
    ""

  const spf =
    /spf=(pass|fail|neutral|softfail|none)/i.exec(authHeader)?.[1]?.toLowerCase() ??
    (fields["X-Mailgun-Spf"] ? fields["X-Mailgun-Spf"].toLowerCase() : "none")

  const dkim =
    /dkim=(pass|fail|none)/i.exec(authHeader)?.[1]?.toLowerCase() ??
    (fields["X-Mailgun-Dkim-Check-Result"] ? fields["X-Mailgun-Dkim-Check-Result"].toLowerCase() : "none")

  const dmarc = /dmarc=(pass|fail|none)/i.exec(authHeader)?.[1]?.toLowerCase() ?? "none"

  return { spf, dkim, dmarc }
}

async function runSpamCheck(rawEmail: string): Promise<{
  score: number
  maxScore: number
  spamRules: Array<{ name: string; score: number; description: string }>
} | null> {
  try {
    const response = await fetch("https://spamcheck.postmarkapp.com/filter", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email: rawEmail, options: "long" }),
    })

    if (!response.ok) return null
    const data = await response.json()
    if (!data.success) return null

    const rules: Array<{ name: string; score: number; description: string }> = []
    if (data.report) {
      for (const line of data.report.split("\n")) {
        const match = /^\s*([-\d.]+)\s+(\S+)\s+(.+)$/.exec(line)
        if (match) {
          const score = parseFloat(match[1])
          if (!isNaN(score) && match[2] !== "pts" && match[2] !== "rule") {
            rules.push({ name: match[2], score, description: match[3].trim() })
          }
        }
      }
    }

    return { score: parseFloat(data.score) || 0, maxScore: 10, spamRules: rules.slice(0, 30) }
  } catch (err) {
    console.error("SpamCheck API error:", err)
    return null
  }
}

function analyzeHtml(htmlBody: string, textBody: string): Record<string, unknown> {
  if (!htmlBody)
    return { hasHtml: false, linkCount: 0, imageCount: 0, textHtmlRatio: 1, hasUnsubscribe: false }

  const linkCount = (htmlBody.match(/<a\s/gi) ?? []).length
  const imageCount = (htmlBody.match(/<img\s/gi) ?? []).length
  const hasUnsubscribe = /unsub|opt.?out|manage.*preferences/i.test(htmlBody)
  const textLen = textBody?.length ?? 0
  const htmlLen = htmlBody.replace(/<[^>]+>/g, "").length
  const textHtmlRatio = htmlLen > 0 ? Math.round((textLen / htmlLen) * 100) / 100 : 0

  return { hasHtml: true, linkCount, imageCount, textHtmlRatio, hasUnsubscribe }
}

async function handleSpamTestEmail(fields: Record<string, string>) {
  const recipient = (fields["recipient"] || fields["To"] || fields["to"] || "").toLowerCase()
  const subject = fields["subject"] || fields["Subject"] || ""
  const fromAddress = fields["sender"] || fields["from"] || fields["From"] || ""
  const bodyHtml = fields["body-html"] || fields["html"] || ""
  const bodyText = fields["body-plain"] || fields["text"] || ""
  const rawMime = fields["body-mime"] || ""

  const spamTest = await prisma.spamTest.findFirst({
    where: { testAddress: recipient, status: "pending" },
  })

  if (!spamTest) {
    console.log("No pending spam test found for:", recipient)
    return NextResponse.json({ ok: true, message: "No matching test" })
  }

  const emailForCheck =
    rawMime ||
    [
      `From: ${fromAddress}`,
      `To: ${recipient}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain`,
      ``,
      bodyText || "(no body)",
    ].join("\r\n")

  const spamResult = await runSpamCheck(emailForCheck)
  const authResults = parseAuthResults(fields)
  const htmlAnalysis = analyzeHtml(bodyHtml, bodyText)

  const rawHeaders: Record<string, string> = {}
  for (const h of [
    "From", "To", "Subject", "Message-Id", "X-Mailer",
    "List-Unsubscribe", "Authentication-Results", "Received-SPF", "DKIM-Signature",
  ]) {
    const val = fields[h] || fields[h.toLowerCase()]
    if (val) rawHeaders[h] = val
  }

  await prisma.spamTest.update({
    where: { id: spamTest.id },
    data: {
      status: "received",
      receivedAt: new Date(),
      subject,
      fromAddress,
      score: spamResult?.score ?? null,
      maxScore: spamResult?.maxScore ?? null,
      spamRules: spamResult?.spamRules ?? [],
      spfResult: authResults.spf,
      dkimResult: authResults.dkim,
      dmarcResult: authResults.dmarc,
      htmlAnalysis,
      rawHeaders,
    },
  })

  console.log("Spam test completed for:", recipient, "Score:", spamResult?.score)
  return NextResponse.json({ ok: true })
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    console.log("Received inbound email webhook from Mailgun")

    const formData = await request.formData()
    const dataEntries = Object.fromEntries(
      Array.from(formData.entries()).map(([k, v]) => [k, typeof v === "string" ? v : ""])
    ) as Record<string, string>

    // Verify the webhook signature
    const timestamp = dataEntries["timestamp"] ?? ""
    const token = dataEntries["token"] ?? ""
    const signature = dataEntries["signature"] ?? ""

    if (!verifyMailgunWebhook(timestamp, token, signature)) {
      console.error("Invalid Mailgun webhook signature")
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
    }

    // Route spam test emails to the dedicated handler
    const recipient = (dataEntries["recipient"] || dataEntries["To"] || dataEntries["to"] || "").toLowerCase()
    if (recipient.startsWith("spamtest-")) {
      return handleSpamTestEmail(dataEntries)
    }

    // Normal inbound email — queue for processing
    console.log("From:", dataEntries.from || dataEntries.From)
    console.log("To:", dataEntries.to || dataEntries.To)
    console.log("Subject:", dataEntries.subject || dataEntries.Subject)

    const emailData = {
      id: uuidv4(),
      rawData: JSON.stringify(dataEntries),
      processed: false,
      processingAttempts: 0,
      createdAt: new Date(),
    }

    await prisma.emailQueue.create({ data: emailData })
    console.log("Email queued for processing:", emailData.id)

    return NextResponse.json({
      success: true,
      message: "Email received and queued for processing",
      emailId: emailData.id,
    })
  } catch (error) {
    console.error("Error processing inbound email:", error)
    return NextResponse.json(
      { error: "Failed to process email", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
