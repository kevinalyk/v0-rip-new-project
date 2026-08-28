/**
 * Admin email alert for the highest-risk action the Claude CI Assignment MCP
 * can take: creating a brand new CiEntity. A wrong new entity (duplicate,
 * misspelled, wrong party/state) is the mistake most worth catching fast, so
 * this fires immediately rather than waiting for someone to check the API
 * Activity tab. Follows the same fixed-admin-recipient Mailgun pattern as
 * lib/mailgun.tsx's sendNewSignupNotification - intentionally kept as a
 * separate, small helper rather than editing that large shared file.
 */

const ADMIN_NOTIFICATION_EMAIL = "kevin@rip-tool.com"

export async function sendCiEntityCreatedByApiNotification(params: {
  entityId: string
  entityName: string
  entityType: string
  party?: string | null
  state?: string | null
  reasoning?: string | null
  apiKeyName: string
  createdAt: Date
}): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("[v0] Mailgun credentials not configured - skipping CI entity creation alert")
    return false
  }

  const { entityId, entityName, entityType, party, state, reasoning, apiKeyName, createdAt } = params

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  }).format(createdAt)

  const entityUrl = `https://app.rip-tool.com/rip/admin/ci-entities?entityId=${entityId}`

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="background: #d97706; padding: 24px 28px;">
            <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">RIP Tool</p>
            <h1 style="margin: 4px 0 0 0; color: white; font-size: 22px; font-weight: 700;">New CI Entity Created by API</h1>
          </div>
          <div style="padding: 28px;">
            <p style="margin: 0 0 16px 0; font-size: 14px; color: #555;">
              The Claude CI Assignment MCP just created a new entity. Please review it for accuracy.
            </p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; width: 38%; vertical-align: top;">Entity Name</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${entityName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Type</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${entityType}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Party / State</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${party || "—"} / ${state || "—"}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">API Key</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${apiKeyName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Created</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${formattedDate}</td>
              </tr>
              ${
                reasoning
                  ? `<tr>
                <td style="padding: 10px 0; font-size: 13px; color: #666; vertical-align: top;">Claude&apos;s Reasoning</td>
                <td style="padding: 10px 0; font-size: 14px; color: #444; font-style: italic;">${reasoning}</td>
              </tr>`
                  : ""
              }
            </table>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${entityUrl}" style="display: inline-block; background: #d97706; color: white; text-decoration: none; padding: 11px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">Review Entity</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `

  const text = `
New CI Entity Created by API — RIP Tool

Entity Name: ${entityName}
Type:        ${entityType}
Party/State: ${party || "—"} / ${state || "—"}
API Key:     ${apiKeyName}
Created:     ${formattedDate}
${reasoning ? `Reasoning:   ${reasoning}` : ""}

Review: ${entityUrl}
  `.trim()

  const formData = new FormData()
  formData.append("from", `RIP Tool Alerts <inbox@${MAILGUN_DOMAIN}>`)
  formData.append("to", ADMIN_NOTIFICATION_EMAIL)
  formData.append("subject", `New CI Entity via API: ${entityName}`)
  formData.append("html", html)
  formData.append("text", text)

  try {
    const response = await fetch(`https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${MAILGUN_API_KEY}`).toString("base64")}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("[v0] Mailgun CI entity creation alert error:", response.status, errorText)
      return false
    }

    return true
  } catch (error) {
    console.error("[v0] Error sending CI entity creation alert:", error)
    return false
  }
}
