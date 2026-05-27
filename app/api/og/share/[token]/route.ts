import { type NextRequest } from "next/server"
import { ImageResponse } from "next/og"
import { PrismaClient } from "@prisma/client"

export const runtime = "edge"

// Edge runtime can't use PrismaClient — use fetch to our own API instead
// We query the DB via a lightweight internal helper using the Neon HTTP driver
import { neon } from "@neondatabase/serverless"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.rip-tool.com"

export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params

  try {
    const sql = neon(process.env.DATABASE_URL!)

    // Try email campaign first
    const emailRows = await sql`
      SELECT
        cic.subject,
        cic."rawSubject",
        cic."senderName",
        cic."inboxRate",
        cic."dateReceived",
        e.name AS "entityName",
        e.party
      FROM "CompetitiveInsightCampaign" cic
      LEFT JOIN "Entity" e ON e.id = cic."entityId"
      WHERE cic."shareToken" = ${token}
      LIMIT 1
    `

    let entityName = ""
    let subject = ""
    let party = ""
    let inboxRate: number | null = null
    let isSms = false
    let smsMessage = ""

    if (emailRows.length > 0) {
      const row = emailRows[0]
      entityName = row.entityName || row.senderName || "Unknown Sender"
      subject = row.rawSubject || row.subject || ""
      party = row.party || ""
      inboxRate = row.inboxRate != null ? Math.round(Number(row.inboxRate) * 100) : null
    } else {
      // Try SMS
      const smsRows = await sql`
        SELECT
          sq.message,
          sq."phoneNumber",
          e.name AS "entityName",
          e.party
        FROM "SmsQueue" sq
        LEFT JOIN "Entity" e ON e.id = sq."entityId"
        WHERE sq."shareToken" = ${token}
        LIMIT 1
      `
      if (smsRows.length > 0) {
        const row = smsRows[0]
        isSms = true
        entityName = row.entityName || row.phoneNumber || "Unknown Sender"
        smsMessage = row.message || ""
        party = row.party || ""
      }
    }

    const partyColor = party?.toLowerCase().includes("democrat") ? "#1D4ED8" : "#B91C1C"
    const partyLabel = party?.toLowerCase().includes("democrat") ? "Democrat" : party?.toLowerCase().includes("republican") ? "Republican" : party || ""

    const displayText = isSms ? smsMessage : subject
    const truncated = displayText.length > 120 ? displayText.slice(0, 117) + "…" : displayText

    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            background: "#F7F8FA",
            display: "flex",
            flexDirection: "column",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Top accent bar */}
          <div style={{ width: "100%", height: 8, background: "#B91C1C", display: "flex" }} />

          {/* Main content */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "60px 80px",
              gap: 32,
            }}
          >
            {/* Sender row */}
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div
                style={{
                  fontSize: 42,
                  fontWeight: 700,
                  color: "#111827",
                  lineHeight: 1.1,
                  flex: 1,
                }}
              >
                {entityName}
              </div>
              {partyLabel ? (
                <div
                  style={{
                    background: partyColor,
                    color: "#fff",
                    fontSize: 20,
                    fontWeight: 600,
                    padding: "6px 18px",
                    borderRadius: 999,
                    flexShrink: 0,
                  }}
                >
                  {partyLabel}
                </div>
              ) : null}
            </div>

            {/* Subject / message */}
            <div
              style={{
                fontSize: 30,
                color: "#374151",
                lineHeight: 1.4,
                background: "#fff",
                border: "1px solid #E5E7EB",
                borderRadius: 16,
                padding: "28px 36px",
              }}
            >
              {isSms ? (
                <span style={{ color: "#6B7280", fontSize: 22, marginRight: 12 }}>SMS: </span>
              ) : (
                <span style={{ color: "#6B7280", fontSize: 22, marginRight: 12 }}>Subject: </span>
              )}
              {truncated}
            </div>

            {/* Inbox rate badge — email only */}
            {!isSms && inboxRate !== null ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    background: inboxRate >= 80 ? "#D1FAE5" : inboxRate >= 50 ? "#FEF3C7" : "#FEE2E2",
                    color: inboxRate >= 80 ? "#065F46" : inboxRate >= 50 ? "#92400E" : "#991B1B",
                    fontSize: 22,
                    fontWeight: 600,
                    padding: "6px 20px",
                    borderRadius: 999,
                  }}
                >
                  {inboxRate}% inbox rate
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div
            style={{
              height: 72,
              background: "#1B3A6B",
              display: "flex",
              alignItems: "center",
              padding: "0 80px",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              {/* Logo mark */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  background: "#fff",
                  borderRadius: 8,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <div style={{ width: 20, height: 20, background: "#1B3A6B", borderRadius: 3, display: "flex" }} />
              </div>
              <span style={{ color: "#fff", fontSize: 24, fontWeight: 700 }}>Inbox.GOP</span>
            </div>
            <span style={{ color: "#93C5FD", fontSize: 20 }}>app.rip-tool.com</span>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (error) {
    console.error("[OG] Failed to generate image:", error)

    // Fallback card
    return new ImageResponse(
      (
        <div
          style={{
            width: 1200,
            height: 630,
            background: "#1B3A6B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui",
          }}
        >
          <div style={{ color: "#fff", fontSize: 48, fontWeight: 700 }}>Inbox.GOP</div>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }
}
