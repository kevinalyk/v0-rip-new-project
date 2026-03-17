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

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0f0f0f",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Red accent bar at top */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            backgroundColor: "#dc2a28",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            padding: "60px 72px",
          }}
        >
          {/* Top row: INBOX.GOP badge + type label */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                backgroundColor: "#dc2a28",
                color: "#ffffff",
                fontSize: "16px",
                fontWeight: "700",
                letterSpacing: "0.12em",
                padding: "6px 16px",
                borderRadius: "4px",
              }}
            >
              INBOX.GOP
            </div>
            <div style={{ color: "#6b7280", fontSize: "16px", fontWeight: "500" }}>
              {typeLabel}
            </div>
            {entityName ? (
              <div
                style={{
                  marginLeft: "8px",
                  color: "#9ca3af",
                  fontSize: "16px",
                }}
              >
                — {entityName}
              </div>
            ) : null}
          </div>

          {/* Middle: Subject + body excerpt */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              flex: 1,
              justifyContent: "center",
            }}
          >
            <div
              style={{
                fontSize: subject.length > 60 ? "40px" : "50px",
                fontWeight: "800",
                color: "#ffffff",
                lineHeight: 1.15,
                maxWidth: "960px",
              }}
            >
              {truncate(subject, 100)}
            </div>

            {bodyExcerpt ? (
              <div
                style={{
                  fontSize: "22px",
                  color: "#9ca3af",
                  lineHeight: 1.5,
                  maxWidth: "860px",
                }}
              >
                {bodyExcerpt}
              </div>
            ) : null}
          </div>

          {/* Bottom: sender + date + domain */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "4px",
              }}
            >
              {senderName ? (
                <div style={{ color: "#e5e7eb", fontSize: "17px", fontWeight: "600" }}>
                  {senderName}
                </div>
              ) : null}
              {senderDetail ? (
                <div style={{ color: "#6b7280", fontSize: "15px" }}>{senderDetail}</div>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: "4px",
              }}
            >
              {dateStr ? (
                <div style={{ color: "#6b7280", fontSize: "15px" }}>{dateStr}</div>
              ) : null}
              <div style={{ color: "#4b5563", fontSize: "15px" }}>app.rip-tool.com</div>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
