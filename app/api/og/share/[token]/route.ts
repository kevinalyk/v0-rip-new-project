import { type NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

export const runtime = "nodejs"
export const maxDuration = 60

const prisma = new PrismaClient()

// Prepare email HTML identically to how the share page does it
function prepareEmailHtml(html: string): string {
  if (!html) return "<p>No content available.</p>"

  // Disable all links (pointer-events: none)
  let prepared = html.replace(/<a\s/gi, '<a style="pointer-events:none;cursor:default;" ')

  // Inject base style reset
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

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  try {
    // Fetch campaign data
    let emailHtml = ""
    let isSms = false
    let smsMessage = ""

    const campaign = await prisma.competitiveInsightCampaign.findUnique({
      where: { shareToken: token },
      select: { emailContent: true, emailPreview: true },
    })

    if (campaign) {
      emailHtml = campaign.emailContent || campaign.emailPreview || ""
    } else {
      const sms = await prisma.smsQueue.findUnique({
        where: { shareToken: token },
        select: { message: true },
      })
      if (sms) {
        isSms = true
        smsMessage = sms.message || ""
      }
    }

    // Build the HTML to screenshot
    const htmlToRender = isSms
      ? `<!DOCTYPE html><html><head><style>
          body { margin: 0; padding: 32px; font-family: Arial, sans-serif; background: #fff; font-size: 16px; line-height: 1.6; color: #111; }
        </style></head><body>${smsMessage.replace(/\n/g, "<br>")}</body></html>`
      : `<!DOCTYPE html><html><head></head><body>${prepareEmailHtml(emailHtml)}</body></html>`

    // Launch Puppeteer with Sparticuz Chromium
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
      defaultViewport: { width: 1200, height: 630 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 600, height: 630, deviceScaleFactor: 2 })
    await page.setContent(htmlToRender, { waitUntil: "networkidle0", timeout: 20000 })

    // Wait a moment for images to load
    await new Promise((r) => setTimeout(r, 1000))

    // Screenshot the page content, capped at 630px height
    const screenshot = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 600, height: 630 },
    })

    await browser.close()

    return new NextResponse(screenshot as Buffer, {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    })
  } catch (error) {
    console.error("[OG] Screenshot failed:", error)
    return NextResponse.json({ error: "Failed to generate image" }, { status: 500 })
  }
}
