import { ImageResponse } from "next/og"
import { PrismaClient } from "@prisma/client"

export const runtime = "nodejs"
export const alt = "Campaign shared on RIP"
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = "image/png"

const prisma = new PrismaClient()

export default async function Image({ params }: { params: { token: string } }) {
  try {
    const token = params.token

    const logoResponse = await fetch(
      new URL("/images/FullLogo_Transparent_NoBuffer.png", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
    )
    const logoBuffer = await logoResponse.arrayBuffer()

    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          gap: "32px",
          padding: "48px",
        }}
      >
        {/* RIP Logo */}
        <img
          src={`data:image/png;base64,${Buffer.from(logoBuffer).toString("base64")}`}
          alt="RIP Tool Logo"
          width="240"
          height="80"
        />

        {/* Branding Text */}
        <div
          style={{
            fontSize: "28px",
            fontWeight: "600",
            color: "#374151",
            textAlign: "center",
          }}
        >
          Competitive Intelligence Platform
        </div>
      </div>,
      {
        ...size,
      },
    )
  } catch (error) {
    console.error("[v0] OG image generation error:", error)
    return new ImageResponse(
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#ffffff",
          gap: "24px",
        }}
      >
        <div
          style={{
            fontSize: "64px",
          }}
        >
          🔗
        </div>
        <div
          style={{
            fontSize: "32px",
            fontWeight: "bold",
            color: "#000000",
          }}
        >
          Shared on RIP
        </div>
        <div
          style={{
            fontSize: "20px",
            color: "#6b7280",
          }}
        >
          Competitive Intelligence Platform
        </div>
      </div>,
      {
        ...size,
      },
    )
  }
}
