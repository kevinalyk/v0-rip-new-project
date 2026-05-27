import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"
import { put } from "@vercel/blob"

export const runtime = "nodejs"
export const maxDuration = 60

const prisma = new PrismaClient()

function prepareEmailHtml(html: string): string {
  if (!html) return "<p>No content available.</p>"
  let prepared = html.replace(/<a\s/gi, '<a style="pointer-events:none;cursor:default;" ')
  const baseStyle = `
    <style>
      * { max-width: 100% !important; box-sizing: border-box !important; }
      body { margin: 0 !important; padding: 16px !important; font-family: Arial, sans-serif !important; background: #fff !important; }
      img { max-width: 100% !important; height: auto !important; }
      table { max-width: 100% !important; }
      a { pointer-events: none !important; cursor: default !important; }
    </style>
  `
  if (/<head[^>]*>/i.test(prepared)) {
    prepared = prepared.replace(/<head[^>]*>/i, (m) => `${m}${baseStyle}`)
  } else {
    prepared = baseStyle + prepared
  }
  return prepared
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  // Simple internal auth — only callable server-side via INTERNAL_API_SECRET
  const secret = request.headers.get("x-internal-secret")
  if (secret !== process.env.INTERNAL_API_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    let emailHtml = ""
    let isSms = false
    let smsMessage = ""
    let campaignId: string | null = null
    let smsId: string | null = null

    // Check if already generated
    const existing = await prisma.competitiveInsightCampaign.findUnique({
      where: { shareToken: token },
      select: { id: true, emailContent: true, emailPreview: true, ogImageUrl: true },
    })

    if (existing) {
      if (existing.ogImageUrl) {
        return NextResponse.json({ url: existing.ogImageUrl, cached: true })
      }
      campaignId = existing.id
      emailHtml = existing.emailContent || existing.emailPreview || ""
    } else {
      const sms = await prisma.smsQueue.findUnique({
        where: { shareToken: token },
        select: { id: true, message: true, ogImageUrl: true },
      })
      if (!sms) {
        return NextResponse.json({ error: "Token not found" }, { status: 404 })
      }
      if (sms.ogImageUrl) {
        return NextResponse.json({ url: sms.ogImageUrl, cached: true })
      }
      isSms = true
      smsId = sms.id
      smsMessage = sms.message || ""
    }

    // Build HTML to screenshot
    const htmlToRender = isSms
      ? `<!DOCTYPE html><html><head><style>
          body { margin: 0; padding: 32px; font-family: Arial, sans-serif; background: #fff; font-size: 16px; line-height: 1.6; color: #111; }
        </style></head><body>${smsMessage.replace(/\n/g, "<br>")}</body></html>`
      : `<!DOCTYPE html><html><head></head><body>${prepareEmailHtml(emailHtml)}</body></html>`

    // Launch Puppeteer
    let chromium: any
    let puppeteer: any
    try {
      chromium = (await import("@sparticuz/chromium")).default
      puppeteer = (await import("puppeteer-core")).default
    } catch {
      return NextResponse.json({ error: "Puppeteer unavailable" }, { status: 500 })
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 600, height: 630, deviceScaleFactor: 2 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 600, height: 630, deviceScaleFactor: 2 })
    await page.setContent(htmlToRender, { waitUntil: "networkidle0", timeout: 20000 })
    await new Promise((r) => setTimeout(r, 1000))

    const screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 600, height: 630 },
    })

    await browser.close()

    // Upload to Vercel Blob (public so Twitter can fetch it directly)
    const blob = await put(`og-images/${token}.png`, screenshot as Buffer, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: false,
    })

    // Store the URL back on the record
    if (campaignId) {
      await prisma.competitiveInsightCampaign.update({
        where: { id: campaignId },
        data: { ogImageUrl: blob.url },
      })
    } else if (smsId) {
      await prisma.smsQueue.update({
        where: { id: smsId },
        data: { ogImageUrl: blob.url },
      })
    }

    console.log(`[og-generate] Generated and stored OG image for token ${token}: ${blob.url}`)
    return NextResponse.json({ url: blob.url })
  } catch (error) {
    console.error("[og-generate] Failed:", error)
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 })
  }
}
