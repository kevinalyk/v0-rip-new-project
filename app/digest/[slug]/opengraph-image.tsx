import { ImageResponse } from "next/og"
import prisma from "@/lib/prisma"

export const runtime = "nodejs"
export const revalidate = 3600
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

interface Props {
  params: { slug: string }
}

export default async function DigestOGImage({ params }: Props) {
  let title = "Intelligence Digest"
  let summary = "Political intelligence and analysis from Inbox.GOP"
  let imageUrl: string | null = null

  try {
    const article = await prisma.digestArticle.findUnique({
      where: { slug: params.slug },
      select: { title: true, summary: true, body: true, imageUrl: true },
    })
    if (article) {
      title = article.title
      summary =
        article.summary ||
        article.body.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
      imageUrl = article.imageUrl ?? null
    }
  } catch {
    // fall through to defaults
  }

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "1200px",
          height: "630px",
          backgroundColor: "#0f0f0f",
          fontFamily: "sans-serif",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Hero image background (blurred) if available */}
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.18,
            }}
          />
        )}

        {/* Dark overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, rgba(15,15,15,0.97) 0%, rgba(30,10,10,0.92) 100%)",
          }}
        />

        {/* Content */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "60px 72px",
            height: "100%",
          }}
        >
          {/* Top: brand */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span
                style={{
                  color: "#dc2a28",
                  fontSize: "18px",
                  fontWeight: 800,
                  letterSpacing: "-0.5px",
                }}
              >
                Inbox.GOP
              </span>
              <span style={{ color: "#555", fontSize: "18px" }}>·</span>
              <span
                style={{
                  color: "#888",
                  fontSize: "14px",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "2px",
                }}
              >
                Intelligence Digest
              </span>
            </div>
          </div>

          {/* Middle: title + summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* DAILY DIGEST badge */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span
                style={{
                  color: "#dc2a28",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "3px",
                  textTransform: "uppercase",
                  border: "1.5px solid #dc2a28",
                  borderRadius: "4px",
                  padding: "4px 10px",
                }}
              >
                Daily Digest
              </span>
            </div>

            <div
              style={{
                color: "#ffffff",
                fontSize: title.length > 60 ? "40px" : "48px",
                fontWeight: 800,
                lineHeight: 1.15,
                letterSpacing: "-1px",
                maxWidth: "920px",
              }}
            >
              {title}
            </div>

            <div
              style={{
                color: "#aaaaaa",
                fontSize: "20px",
                lineHeight: 1.5,
                maxWidth: "820px",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {summary}
            </div>
          </div>

          {/* Bottom: URL */}
          <div
            style={{
              color: "#555",
              fontSize: "14px",
              letterSpacing: "0.5px",
            }}
          >
            app.rip-tool.com/digest
          </div>
        </div>

        {/* Red accent bar on left */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "6px",
            height: "100%",
            backgroundColor: "#dc2a28",
          }}
        />
      </div>
    ),
    { ...size }
  )
}
