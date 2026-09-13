import { ImageResponse } from "next/og"

export const runtime = "nodejs"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
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
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
            padding: "60px 72px",
            gap: "28px",
          }}
        >
          <div
            style={{
              backgroundColor: "#dc2a28",
              color: "#ffffff",
              fontSize: "20px",
              fontWeight: "700",
              letterSpacing: "0.12em",
              padding: "8px 20px",
              borderRadius: "4px",
            }}
          >
            RIP TOOL
          </div>

          <div
            style={{
              fontSize: "56px",
              fontWeight: "800",
              color: "#ffffff",
              lineHeight: 1.15,
              textAlign: "center",
              maxWidth: "920px",
            }}
          >
            Republican Inboxing Protocol
          </div>

          <div
            style={{
              fontSize: "24px",
              color: "#9ca3af",
              lineHeight: 1.5,
              textAlign: "center",
              maxWidth: "760px",
            }}
          >
            Competitive intelligence for Republican political campaigns, committees, and organizations.
          </div>

          <div style={{ color: "#4b5563", fontSize: "16px", marginTop: "12px" }}>app.rip-tool.com</div>
        </div>
      </div>
    ),
    { ...size },
  )
}
