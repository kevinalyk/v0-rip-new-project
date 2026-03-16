import { type NextRequest, NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { verifyAuth } from "@/lib/auth"

export async function POST(request: NextRequest) {
  const authResult = await verifyAuth(request)
  if (!authResult.success) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  try {
    const formData = await request.formData()
    const title = (formData.get("title") as string)?.trim()
    const details = (formData.get("details") as string)?.trim() || null
    const pageUrl = (formData.get("pageUrl") as string)?.trim() || null
    const screenshot = formData.get("screenshot") as File | null

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 })
    }

    // Upload screenshot to Blob if provided
    let screenshotUrl: string | null = null
    if (screenshot && screenshot.size > 0) {
      const blob = await put(`support-tickets/${Date.now()}-${screenshot.name}`, screenshot, {
        access: "public",
      })
      screenshotUrl = blob.url
    }

    // Send email alert to admin
    if (MAILGUN_API_KEY && MAILGUN_DOMAIN) {
      const emailBody = new FormData()
      emailBody.append("from", `RIP Tool <hello@${MAILGUN_DOMAIN}>`)
      emailBody.append("to", "admin@rip-tool.com")
      emailBody.append("subject", `[Support Ticket] ${title}`)
      emailBody.append(
        "html",
        `
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px;">
              <h1 style="color: #dc2626; margin: 0 0 20px 0; font-size: 22px;">New Support Ticket</h1>

              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; width: 120px; color: #555;">Submitted by</td>
                  <td style="padding: 8px 0;">${authResult.user.email}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Title</td>
                  <td style="padding: 8px 0;">${title}</td>
                </tr>
                ${pageUrl ? `<tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555;">Page</td>
                  <td style="padding: 8px 0;"><a href="${pageUrl}" style="color: #dc2626;">${pageUrl}</a></td>
                </tr>` : ""}
                ${details ? `<tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555; vertical-align: top;">Details</td>
                  <td style="padding: 8px 0; white-space: pre-wrap;">${details}</td>
                </tr>` : ""}
                ${screenshotUrl ? `<tr>
                  <td style="padding: 8px 0; font-weight: 600; color: #555; vertical-align: top;">Screenshot</td>
                  <td style="padding: 8px 0;"><a href="${screenshotUrl}" style="color: #dc2626;">View screenshot</a></td>
                </tr>` : ""}
              </table>

              <p style="margin: 20px 0 0 0; font-size: 12px; color: #999;">Submitted at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
            </div>
          </body>
        </html>
        `,
      )

      await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
        },
        body: emailBody,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error submitting support ticket:", error)
    return NextResponse.json({ error: "Failed to submit ticket" }, { status: 500 })
  }
}
