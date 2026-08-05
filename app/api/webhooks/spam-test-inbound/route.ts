import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import crypto from "crypto"

function verifyMailgunWebhook(timestamp: string, token: string, signature: string): boolean {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY
  if (!signingKey) return false
  const encoded = crypto
    .createHmac("sha256", signingKey)
    .update(timestamp.concat(token))
    .digest("hex")
  return encoded === signature
}

// Parse SPF/DKIM/DMARC from Mailgun's received headers and authentication-results header
function parseAuthResults(fields: Record<string, string>) {
  const authHeader =
    fields["Authentication-Results"] ||
    fields["authentication-results"] ||
    fields["X-Mailgun-Spf"] || ""

  const spf = /spf=(pass|fail|neutral|softfail|none)/i.exec(authHeader)?.[1]?.toLowerCase() ??
    (fields["X-Mailgun-Spf"] ? fields["X-Mailgun-Spf"].toLowerCase() : "none")

  const dkim = /dkim=(pass|fail|none)/i.exec(authHeader)?.[1]?.toLowerCase() ??
    (fields["X-Mailgun-Dkim-Check-Result"] ? fields["X-Mailgun-Dkim-Check-Result"].toLowerCase() : "none")

  const dmarc = /dmarc=(pass|fail|none)/i.exec(authHeader)?.[1]?.toLowerCase() ?? "none"

  return { spf, dkim, dmarc }
}

// Run SpamAssassin check via Postmark's free SpamCheck API
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

    // Parse rule details from the "report" string
    const rules: Array<{ name: string; score: number; description: string }> = []
    if (data.report) {
      const lines = data.report.split("\n")
      for (const line of lines) {
        // Format: " 1.23 RULE_NAME    Description text"
        const match = /^\s*([-\d.]+)\s+(\S+)\s+(.+)$/.exec(line)
        if (match) {
          const score = parseFloat(match[1])
          if (!isNaN(score) && match[2] !== "pts" && match[2] !== "rule") {
            rules.push({ name: match[2], score, description: match[3].trim() })
          }
        }
      }
    }

    return {
      score: parseFloat(data.score) || 0,
      maxScore: 10,
      spamRules: rules.slice(0, 30), // cap to top 30 rules
    }
  } catch (err) {
    console.error("SpamCheck API error:", err)
    return null
  }
}

// Basic HTML analysis from body
function analyzeHtml(htmlBody: string, textBody: string): Record<string, unknown> {
  if (!htmlBody) return { hasHtml: false, linkCount: 0, imageCount: 0, textHtmlRatio: 1, hasUnsubscribe: false }

  const linkCount = (htmlBody.match(/<a\s/gi) ?? []).length
  const imageCount = (htmlBody.match(/<img\s/gi) ?? []).length
  const hasUnsubscribe = /unsub|opt.?out|manage.*preferences/i.test(htmlBody)
  const textLen = textBody?.length ?? 0
  const htmlLen = htmlBody.replace(/<[^>]+>/g, "").length
  const textHtmlRatio = htmlLen > 0 ? Math.round((textLen / htmlLen) * 100) / 100 : 0

  return { hasHtml: true, linkCount, imageCount, textHtmlRatio, hasUnsubscribe }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const fields: Record<string, string> = {}
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string") fields[key] = value
    }

    // Verify Mailgun signature
    const timestamp = fields["timestamp"] ?? ""
    const token = fields["token"] ?? ""
    const signature = fields["signature"] ?? ""
    if (timestamp && token && signature) {
      if (!verifyMailgunWebhook(timestamp, token, signature)) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
      }
    }

    const recipient = (fields["recipient"] || fields["To"] || fields["to"] || "").toLowerCase()
    const subject = fields["subject"] || fields["Subject"] || ""
    const fromAddress = fields["sender"] || fields["from"] || fields["From"] || ""
    const bodyHtml = fields["body-html"] || fields["html"] || ""
    const bodyText = fields["body-plain"] || fields["text"] || ""
    const rawMime = fields["body-mime"] || ""

    // Match to a pending spam test by recipient address
    const spamTest = await prisma.spamTest.findFirst({
      where: {
        testAddress: recipient,
        status: "pending",
      },
    })

    if (!spamTest) {
      console.log("No pending spam test found for:", recipient)
      return NextResponse.json({ ok: true, message: "No matching test" })
    }

    // Run SpamAssassin via Postmark SpamCheck
    // Use raw MIME if available, otherwise reconstruct a minimal email
    const emailForCheck = rawMime || [
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

    // Build key headers snapshot
    const rawHeaders: Record<string, string> = {}
    for (const h of ["From", "To", "Subject", "Message-Id", "X-Mailer", "List-Unsubscribe",
      "Authentication-Results", "Received-SPF", "DKIM-Signature"]) {
      if (fields[h] || fields[h.toLowerCase()]) {
        rawHeaders[h] = fields[h] || fields[h.toLowerCase()]
      }
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
  } catch (error) {
    console.error("Error processing spam test inbound:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
