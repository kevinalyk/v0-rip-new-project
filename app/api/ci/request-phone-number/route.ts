import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUser(request)
    if (!authResult.success || !authResult.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { user } = authResult

    // Only owners and admins can request phone numbers
    if (user.role !== "owner" && user.role !== "admin" && user.role !== "super_admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { quantity } = await request.json()

    if (!quantity || typeof quantity !== "number" || quantity < 1 || quantity > 20) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 })
    }

    // Fetch user and client details
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId as string },
      select: { firstName: true, lastName: true, email: true, clientId: true },
    })

    const client = dbUser?.clientId
      ? await prisma.client.findUnique({
          where: { id: dbUser.clientId },
          select: { name: true },
        })
      : null

    const requesterName = [dbUser?.firstName, dbUser?.lastName].filter(Boolean).join(" ") || "Unknown"
    const requesterEmail = dbUser?.email || "Unknown"
    const clientName = client?.name || "Unknown Organization"
    const totalCost = quantity * 100

    const mailgunDomain = process.env.MAILGUN_DOMAIN!
    const mailgunApiKey = process.env.MAILGUN_API_KEY!

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1a1a1a; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .body { background: #f9f9f9; padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px; }
            .detail { margin-bottom: 12px; }
            .label { font-weight: bold; color: #555; font-size: 12px; text-transform: uppercase; }
            .value { font-size: 16px; color: #111; margin-top: 2px; }
            .highlight { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 16px; margin: 16px 0; }
            .footer { margin-top: 24px; font-size: 12px; color: #888; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin:0">Phone Number Request</h2>
              <p style="margin:4px 0 0; opacity:0.8; font-size:14px">A new phone number add-on request has been submitted.</p>
            </div>
            <div class="body">
              <div class="detail">
                <div class="label">Requested By</div>
                <div class="value">${requesterName} (${requesterEmail})</div>
              </div>
              <div class="detail">
                <div class="label">Organization</div>
                <div class="value">${clientName}</div>
              </div>
              <div class="detail">
                <div class="label">Role</div>
                <div class="value">${user.role}</div>
              </div>
              <div class="detail">
                <div class="label">Numbers Requested</div>
                <div class="value">${quantity} phone number${quantity > 1 ? "s" : ""}</div>
              </div>
              <div class="highlight">
                <strong>Subscription Change:</strong> Add $${totalCost}/month for ${quantity} phone number${quantity > 1 ? "s" : ""} ($100 each). Subscription will be updated automatically upon approval.
              </div>
              <div class="footer">
                <p>Submitted at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `

    const formData = new FormData()
    formData.append("from", `RIP Tool <hello@${mailgunDomain}>`)
    formData.append("to", "ryanlyk@gmail.com,kevinalyk@gmail.com")
    formData.append("subject", `Phone Number Request: ${clientName} wants ${quantity} number${quantity > 1 ? "s" : ""}`)
    formData.append("html", html)

    const mailgunResponse = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${mailgunApiKey}`).toString("base64")}`,
      },
      body: formData,
    })

    if (!mailgunResponse.ok) {
      console.error("Mailgun error:", await mailgunResponse.text())
      return NextResponse.json({ error: "Failed to send request email" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error processing phone number request:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
