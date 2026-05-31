import { type NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth"

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

/**
 * POST /api/admin/send-test-seed-email
 *
 * Picks a random real CI campaign with HTML/text content and sends it to the
 * specified seed email address from digest@rip-tool.com, preserving the
 * original sender name, subject, and body so it looks like a real send.
 *
 * Body: { seedEmailId: string }
 * Requires: super_admin
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (authResult.user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden — super_admin only" }, { status: 403 })
    }

    const { seedEmailId } = await request.json()
    if (!seedEmailId) {
      return NextResponse.json({ error: "seedEmailId is required" }, { status: 400 })
    }

    // Load the seed email record
    const seed = await prisma.seedEmail.findUnique({
      where: { id: seedEmailId },
      select: { id: true, email: true, active: true },
    })
    if (!seed) {
      return NextResponse.json({ error: "Seed email not found" }, { status: 404 })
    }

    // Pick a random CI campaign that has real HTML or text body content
    // We use a random offset into campaigns that have content
    const count = await prisma.competitiveInsightCampaign.count({
      where: {
        isDeleted: false,
        isHidden: false,
        OR: [
          { emailContent: { not: null } },
          { emailPreview: { not: null } },
        ],
      },
    })

    if (count === 0) {
      return NextResponse.json({ error: "No CI campaigns with content found to sample from" }, { status: 404 })
    }

    const randomOffset = Math.floor(Math.random() * count)

    const campaigns = await prisma.competitiveInsightCampaign.findMany({
      where: {
        isDeleted: false,
        isHidden: false,
        OR: [
          { emailContent: { not: null } },
          { emailPreview: { not: null } },
        ],
      },
      select: {
        id: true,
        senderName: true,
        senderEmail: true,
        subject: true,
        emailContent: true,
        emailPreview: true,
        dateReceived: true,
      },
      orderBy: { dateReceived: "desc" },
      skip: randomOffset,
      take: 1,
    })

    const campaign = campaigns[0]
    if (!campaign) {
      return NextResponse.json({ error: "Could not select a campaign" }, { status: 500 })
    }

    if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
      return NextResponse.json({ error: "Mailgun not configured" }, { status: 500 })
    }

    // Build the email body — prefer HTML, fall back to plain text preview
    const htmlBody = campaign.emailContent
      ? `<!-- Domain Health Test Send — sampled from campaign ${campaign.id} -->
${campaign.emailContent}`
      : null

    const textBody = campaign.emailPreview
      ? `[Domain Health Test Send — sampled from: ${campaign.senderEmail}]\n\n${campaign.emailPreview}`
      : `[Domain Health Test Send — no body content available for campaign ${campaign.id}]`

    // Send via Mailgun from digest@rip-tool.com
    const form = new FormData()
    form.append("from", `${campaign.senderName} <digest@${MAILGUN_DOMAIN}>`)
    form.append("to", seed.email)
    form.append("subject", `[DH Test] ${campaign.subject}`)
    form.append("text", textBody)
    if (htmlBody) form.append("html", htmlBody)

    // Add realistic headers to make it a good compliance test sample
    form.append("h:X-RIP-Test-Send", "true")
    form.append("h:X-RIP-Sampled-Campaign", campaign.id)
    form.append("h:X-RIP-Original-Sender", campaign.senderEmail)

    const mgRes = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
      },
      body: form,
    })

    if (!mgRes.ok) {
      const errText = await mgRes.text()
      console.error("[send-test-seed-email] Mailgun error:", errText)
      return NextResponse.json({ error: `Mailgun rejected the send: ${errText}` }, { status: 502 })
    }

    const mgData = await mgRes.json()

    return NextResponse.json({
      ok: true,
      to: seed.email,
      from: `${campaign.senderName} <digest@${MAILGUN_DOMAIN}>`,
      subject: `[DH Test] ${campaign.subject}`,
      sampledCampaignId: campaign.id,
      originalSender: campaign.senderEmail,
      originalDateReceived: campaign.dateReceived,
      mailgunId: mgData.id,
    })
  } catch (err) {
    console.error("[send-test-seed-email]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
