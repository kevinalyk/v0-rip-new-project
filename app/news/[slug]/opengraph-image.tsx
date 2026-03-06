import { ImageResponse } from "next/og"
import prisma from "@/lib/prisma"

export const runtime = "nodejs"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image({ params }: { params: { slug: string } }) {
  let title = "RIP Tool News"
  let body = "Competitive Intelligence Platform"
  let publishedAt = ""
  let articleImageUrl: string | null = null

  try {
    const post = await prisma.announcement.findUnique({
      where: { slug: params.slug },
    })
    if (post) {
      title = post.title
      body = post.body.slice(0, 120).replace(/\s+/g, " ").trim()
      if (post.body.length > 120) body += "..."
      publishedAt = new Date(post.publishedAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
      articleImageUrl = post.imageUrl
    }
  } catch {
    // Fall through to defaults
  }

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

        {/* Article image as subtle background tint (if exists) */}
        {articleImageUrl && (
          <div style={{ position: "absolute", inset: 0, display: "flex" }}>
            <img
              src={articleImageUrl}
              style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.12 }}
            />
          </div>
        )}

        {/* Content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            height: "100%",
            padding: "60px 72px",
            position: "relative",
          }}
        >
          {/* Top: RIP badge */}
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
              RIP TOOL
            </div>
            <div style={{ color: "#6b7280", fontSize: "16px", fontWeight: "500" }}>NEWS</div>
          </div>

          {/* Middle: Title + excerpt */}
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
                fontSize: title.length > 60 ? "42px" : "52px",
                fontWeight: "800",
                color: "#ffffff",
                lineHeight: 1.15,
                maxWidth: "920px",
              }}
            >
              {title}
            </div>
            {body && (
              <div
                style={{
                  fontSize: "22px",
                  color: "#9ca3af",
                  lineHeight: 1.5,
                  maxWidth: "820px",
                }}
              >
                {body}
              </div>
            )}
          </div>

          {/* Bottom: Date + domain */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {publishedAt && (
              <div style={{ color: "#6b7280", fontSize: "16px" }}>{publishedAt}</div>
            )}
            <div style={{ color: "#4b5563", fontSize: "16px", marginLeft: "auto" }}>
              app.rip-tool.com
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
