import { ImageResponse } from "next/og"

export const runtime = "edge"
export const alt = "Campaign shared on RIP"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max).trim() + "..." : str
}

export default async function Image({ params }: { params: { token: string } }) {
  let subject = "Shared Campaign"
  let senderName = ""
  let senderDetail = ""
  let bodyExcerpt = ""
  let entityName = ""
  let dateStr = ""
  let isSms = false

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"
    const res = await fetch(`${baseUrl}/api/share/${params.token}`, {
      headers: { Accept: "application/json" },
    })

    if (res.ok) {
      const json = await res.json()
      const data = json.campaign ?? json

      if (data.type === "sms") {
        isSms = true
        subject = "SMS Message"
        senderName = data.phoneNumber || "Unknown"
        senderDetail = data.toNumber ? `to ${data.toNumber}` : ""
        bodyExcerpt = truncate(data.message || "", 160)
        entityName = data.entityName || data.entity?.name || ""
        dateStr = data.createdAt
          ? new Date(data.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
          : ""
      } else {
        subject = data.subject || "Shared Email"
        senderName = data.senderName || ""
        senderDetail = data.senderEmail || ""
        const rawBody = data.emailContent || data.emailPreview || ""
        bodyExcerpt = truncate(stripHtml(rawBody), 160)
        entityName = data.entityName || data.entity?.name || ""
        dateStr = data.dateReceived
          ? new Date(data.dateReceived).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
          : ""
      }
    }
  } catch {
    // fall through to defaults
  }

  const typeLabel = isSms ? "SMS" : "EMAIL"
  const metaLine = [typeLabel, entityName].filter(Boolean).join("  —  ")
  const bottomLeft = [senderName, senderDetail].filter(Boolean).join("  ·  ")
  const bottomRight = [dateStr, "app.rip-tool.com"].filter(Boolean).join("  ·  ")

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0f0f0f",
          fontFamily: "system-ui, sans-serif",
          overflow: "hidden",
        }}
      >
        {/* Red accent bar */}
        <div style={{ display: "flex", width: "100%", height: "6px", backgroundColor: "#dc2a28" }} />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            padding: "52px 72px 48px 72px",
          }}
        >
          {/* Top: badge + meta */}
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                backgroundColor: "#dc2a28",
                color: "#ffffff",
                fontSize: "15px",
                fontWeight: "700",
                letterSpacing: "0.12em",
                padding: "5px 14px",
                borderRadius: "4px",
                marginRight: "16px",
              }}
            >
              INBOX.GOP
            </div>
            <div style={{ display: "flex", color: "#9ca3af", fontSize: "16px" }}>
              {metaLine}
            </div>
          </div>

          {/* Middle: subject + excerpt */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: subject.length > 70 ? "38px" : "50px",
                fontWeight: "800",
                color: "#ffffff",
                lineHeight: 1.15,
                marginBottom: bodyExcerpt ? "20px" : "0px",
              }}
            >
              {truncate(subject, 100)}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: "22px",
                color: "#9ca3af",
                lineHeight: 1.5,
              }}
            >
              {bodyExcerpt}
            </div>
          </div>

          {/* Bottom: sender + date */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div style={{ display: "flex", color: "#6b7280", fontSize: "15px" }}>
              {bottomLeft}
            </div>
            <div style={{ display: "flex", color: "#4b5563", fontSize: "15px" }}>
              {bottomRight}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
