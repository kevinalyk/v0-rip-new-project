// Mailgun email sending utility

import { generateTrackedLink } from "./email-tracking"

const ADMIN_NOTIFICATION_EMAIL = "kevinalyk@gmail.com"

async function sendMailgunEmail(subject: string, html: string, text: string): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("Mailgun credentials not configured")
    return false
  }

  const formData = new FormData()
  formData.append("from", `Inbox.GOP Alerts <inbox@${MAILGUN_DOMAIN}>`)
  formData.append("to", ADMIN_NOTIFICATION_EMAIL)
  formData.append("subject", subject)
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
      console.error("Mailgun admin notification error:", response.status, errorText)
      return false
    }

    return true
  } catch (error) {
    console.error("Error sending admin notification email:", error)
    return false
  }
}

export async function sendNewSignupNotification(params: {
  firstName: string
  lastName: string
  email: string
  clientId: string
  clientName: string
  clientSlug: string
  signupAt: Date
  ipAddress?: string
}): Promise<boolean> {
  const { firstName, lastName, email, clientId, clientName, clientSlug, signupAt, ipAddress } = params

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  }).format(signupAt)

  const profileUrl = `https://app.rip-tool.com/${clientSlug}`

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="background: #dc2626; padding: 24px 28px;">
            <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Inbox.GOP</p>
            <h1 style="margin: 4px 0 0 0; color: white; font-size: 22px; font-weight: 700;">New Account Signup</h1>
          </div>
          <div style="padding: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; width: 38%; vertical-align: top;">Name</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${firstName} ${lastName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Email</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;"><a href="mailto:${email}" style="color: #dc2626; text-decoration: none;">${email}</a></td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Organization</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${clientName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Client ID</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-family: monospace; color: #555;">${clientId}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Signed Up</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${formattedDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Plan</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;"><span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; color: #555;">Free Trial</span></td>
              </tr>
              ${ipAddress ? `
              <tr>
                <td style="padding: 10px 0; font-size: 13px; color: #666; vertical-align: top;">IP Address</td>
                <td style="padding: 10px 0; font-size: 14px; font-family: monospace; color: #888;">${ipAddress}</td>
              </tr>` : ""}
            </table>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${profileUrl}" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; padding: 11px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">View Account Dashboard</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `

  const text = `
New Account Signup — Inbox.GOP

Name:         ${firstName} ${lastName}
Email:        ${email}
Organization: ${clientName}
Client ID:    ${clientId}
Signed Up:    ${formattedDate}
Plan:         Free Trial
${ipAddress ? `IP Address:   ${ipAddress}` : ""}

View account: ${profileUrl}
  `.trim()

  return sendMailgunEmail("New Signup: " + clientName, html, text)
}

export async function sendNewPaymentNotification(params: {
  clientId: string
  clientName?: string
  customerEmail?: string
  planName: string
  amountCents: number
  currency: string
  stripeSessionId: string
  stripeCustomerId: string
  subscriptionId: string
  paidAt: Date
  periodEnd: Date
}): Promise<boolean> {
  const {
    clientId,
    clientName,
    customerEmail,
    planName,
    amountCents,
    currency,
    stripeSessionId,
    stripeCustomerId,
    subscriptionId,
    paidAt,
    periodEnd,
  } = params

  const amountFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amountCents / 100)

  const formattedPaidAt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York",
  }).format(paidAt)

  const formattedPeriodEnd = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(periodEnd)

  const stripeUrl = `https://dashboard.stripe.com/customers/${stripeCustomerId}`

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="background: #16a34a; padding: 24px 28px;">
            <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Inbox.GOP</p>
            <h1 style="margin: 4px 0 0 0; color: white; font-size: 22px; font-weight: 700;">New Subscription Payment</h1>
            <p style="margin: 6px 0 0 0; color: rgba(255,255,255,0.9); font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">${amountFormatted}</p>
          </div>
          <div style="padding: 28px;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; width: 38%; vertical-align: top;">Client ID</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-family: monospace; font-weight: 600;">${clientId}</td>
              </tr>
              ${clientName ? `
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Organization</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${clientName}</td>
              </tr>` : ""}
              ${customerEmail ? `
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Customer Email</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;"><a href="mailto:${customerEmail}" style="color: #16a34a; text-decoration: none;">${customerEmail}</a></td>
              </tr>` : ""}
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Plan</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;"><span style="background: #dcfce7; color: #166534; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 700;">${planName}</span></td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Amount</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 16px; font-weight: 700; color: #16a34a;">${amountFormatted}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Paid At</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${formattedPaidAt}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Renews</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${formattedPeriodEnd}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Subscription ID</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 12px; font-family: monospace; color: #888;">${subscriptionId}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-size: 13px; color: #666; vertical-align: top;">Session ID</td>
                <td style="padding: 10px 0; font-size: 12px; font-family: monospace; color: #888;">${stripeSessionId}</td>
              </tr>
            </table>
            <div style="margin-top: 24px; text-align: center;">
              <a href="${stripeUrl}" style="display: inline-block; background: #16a34a; color: white; text-decoration: none; padding: 11px 24px; border-radius: 6px; font-size: 14px; font-weight: 600;">View in Stripe Dashboard</a>
            </div>
          </div>
        </div>
      </body>
    </html>
  `

  const text = `
New Subscription Payment — Inbox.GOP

Amount:          ${amountFormatted}
Client ID:       ${clientId}
${clientName ? `Organization:    ${clientName}` : ""}
${customerEmail ? `Customer Email:  ${customerEmail}` : ""}
Plan:            ${planName}
Paid At:         ${formattedPaidAt}
Renews:          ${formattedPeriodEnd}
Subscription ID: ${subscriptionId}
Session ID:      ${stripeSessionId}

Stripe Dashboard: ${stripeUrl}
  `.trim()

  return sendMailgunEmail(`New Payment: ${amountFormatted} — ${clientId}`, html, text)
}

export async function sendWelcomeEmail(params: {
  firstName: string
  lastName: string
  email: string
  organizationName: string
  plan?: string
  loginUrl?: string
}): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("[Mailgun] Credentials not configured — skipping welcome email")
    return false
  }

  const {
    firstName,
    lastName,
    email,
    organizationName,
    plan = "Free Trial",
    loginUrl = "https://app.rip-tool.com/login",
  } = params

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date())

  const html = `
    <!DOCTYPE html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1a1a1a; max-width: 560px; margin: 0 auto; padding: 20px; background: #f5f5f5;">
        <div style="background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <div style="background: #dc2626; padding: 24px 28px;">
            <p style="margin: 0; color: rgba(255,255,255,0.8); font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Inbox.GOP</p>
            <h1 style="margin: 4px 0 0 0; color: white; font-size: 22px; font-weight: 700;">Welcome to Inbox.GOP, ${firstName}!</h1>
            <p style="margin: 6px 0 0 0; color: rgba(255,255,255,0.85); font-size: 14px;">Your account has been created successfully.</p>
          </div>
          <div style="padding: 28px;">
            <p style="margin: 0 0 20px 0; font-size: 15px; color: #333;">Here are your account details. You can sign in at any time using your email address and the password you set during registration.</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; width: 38%; vertical-align: top;">Name</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${firstName} ${lastName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Email</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Organization</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px; font-weight: 600;">${organizationName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; color: #666; vertical-align: top;">Plan</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f0f0f0; font-size: 14px;"><span style="background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; color: #555;">${plan}</span></td>
              </tr>
              <tr>
                <td style="padding: 10px 0; font-size: 13px; color: #666; vertical-align: top;">Account Created</td>
                <td style="padding: 10px 0; font-size: 14px; color: #333;">${formattedDate}</td>
              </tr>
            </table>
            <div style="margin-top: 28px; text-align: center;">
              <a href="${loginUrl}" style="display: inline-block; background: #dc2626; color: white; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600;">Sign In to Inbox.GOP</a>
            </div>
            <p style="margin: 24px 0 0 0; font-size: 13px; color: #888; text-align: center;">If you did not create this account, contact us at <a href="mailto:support@rip-tool.com" style="color: #dc2626; text-decoration: none;">support@rip-tool.com</a>.</p>
          </div>
          <div style="padding: 16px 28px; background: #f9fafb; border-top: 1px solid #f0f0f0; text-align: center;">
            <p style="margin: 0; font-size: 12px; color: #999;">Inbox.GOP — Republican Inboxing Protocol</p>
          </div>
        </div>
      </body>
    </html>
  `

  const text = `
Welcome to Inbox.GOP, ${firstName}!

Your account has been created successfully. Here are your details:

Name:         ${firstName} ${lastName}
Email:        ${email}
Organization: ${organizationName}
Plan:         ${plan}
Created:      ${formattedDate}

Sign in here: ${loginUrl}

If you did not create this account, contact support@rip-tool.com.

— Inbox.GOP
  `.trim()

  const formData = new FormData()
  formData.append("from", `Inbox.GOP <inbox@${MAILGUN_DOMAIN}>`)
  formData.append("to", email)
  formData.append("subject", `Welcome to Inbox.GOP, ${firstName}!`)
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
      console.error("[Mailgun] Welcome email error:", response.status, errorText)
      return false
    }

    console.log("[Mailgun] Welcome email sent to:", email)
    return true
  } catch (error) {
    console.error("[Mailgun] Error sending welcome email:", error)
    return false
  }
}

export async function sendPasswordResetEmail(email: string, resetToken: string): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("Mailgun credentials not configured")
    return false
  }

  // Construct reset URL - use app.rip-tool.com in production
  const baseUrl = process.env.NODE_ENV === "production" ? "https://app.rip-tool.com" : "http://localhost:3000"
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`

  const formData = new FormData()
  formData.append("from", `RIP Tool <hello@${MAILGUN_DOMAIN}>`)
  formData.append("to", email)
  formData.append("subject", "Reset Your Password - RIP Tool")
  formData.append(
    "html",
    `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
          <h1 style="color: #dc2626; margin: 0 0 20px 0; font-size: 24px;">Reset Your Password</h1>
          <p style="margin: 0 0 20px 0; font-size: 16px;">
            We received a request to reset your password for your RIP Tool account.
          </p>
          <p style="margin: 0 0 20px 0; font-size: 16px;">
            Click the button below to reset your password. This link will expire in 1 hour.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          <p style="margin: 20px 0 0 0; font-size: 14px; color: #666;">
            If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
          </p>
        </div>
        <div style="text-align: center; font-size: 12px; color: #999; margin-top: 20px;">
          <p>Inbox.GOP</p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;">${resetUrl}</p>
        </div>
      </body>
    </html>
  `,
  )
  formData.append(
    "text",
    `
Reset Your Password

We received a request to reset your password for your RIP Tool account.

Click the link below to reset your password. This link will expire in 1 hour.

${resetUrl}

If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.

---
Inbox.GOP
  `,
  )

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
      console.error("Mailgun API error:", response.status, errorText)
      return false
    }

    const result = await response.json()
    console.log("Password reset email sent successfully:", result.id)
    return true
  } catch (error) {
    console.error("Error sending password reset email:", error)
    return false
  }
}

export async function sendSubscriptionCancellationWarning(
  email: string,
  clientName: string,
  planName: string,
  expiryDate: Date,
  followedEntities: string[],
  featuresLost: string[],
): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("Mailgun credentials not configured")
    return false
  }

  const formattedDate = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(expiryDate)

  const baseUrl = process.env.NODE_ENV === "production" ? "https://app.rip-tool.com" : "http://localhost:3000"
  const billingUrl = `${baseUrl}/${clientName}/billing`

  const formData = new FormData()
  formData.append("from", `RIP Tool <hello@${MAILGUN_DOMAIN}>`)
  formData.append("to", email)
  formData.append("subject", `Your ${planName} subscription is ending soon`)
  formData.append(
    "html",
    `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
          <h1 style="color: #856404; margin: 0 0 20px 0; font-size: 24px;">Your Subscription is Ending</h1>
          <p style="margin: 0 0 20px 0; font-size: 16px;">
            Your <strong>${planName}</strong> subscription will end on <strong>${formattedDate}</strong>.
          </p>
          
          ${
            followedEntities.length > 0
              ? `
          <div style="background-color: #fff; border-radius: 6px; padding: 20px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #333;">Entities You'll Be Unfollowed From:</h2>
            <ul style="margin: 0; padding-left: 20px;">
              ${followedEntities.map((entity) => `<li style="margin: 5px 0;">${entity}</li>`).join("")}
            </ul>
          </div>
          `
              : ""
          }
          
          ${
            featuresLost.length > 0
              ? `
          <div style="background-color: #fff; border-radius: 6px; padding: 20px; margin: 20px 0;">
            <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #333;">Features You'll Lose Access To:</h2>
            <ul style="margin: 0; padding-left: 20px;">
              ${featuresLost.map((feature) => `<li style="margin: 5px 0;">${feature}</li>`).join("")}
            </ul>
          </div>
          `
              : ""
          }
          
          <p style="margin: 20px 0; font-size: 16px;">
            To keep your current plan and maintain access, you can reactivate your subscription before ${formattedDate}.
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${billingUrl}" style="background-color: #dc2626; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: 600; font-size: 16px;">
              Manage Subscription
            </a>
          </div>
        </div>
        
        <div style="text-align: center; font-size: 12px; color: #999; margin-top: 20px;">
          <p>Inbox.GOP</p>
          <p>If the button doesn't work, visit: ${billingUrl}</p>
        </div>
      </body>
    </html>
  `,
  )
  formData.append(
    "text",
    `
Your Subscription is Ending

Your ${planName} subscription will end on ${formattedDate}.

${
  followedEntities.length > 0
    ? `
Entities You'll Be Unfollowed From:
${followedEntities.map((entity) => `• ${entity}`).join("\n")}
`
    : ""
}

${
  featuresLost.length > 0
    ? `
Features You'll Lose Access To:
${featuresLost.map((feature) => `• ${feature}`).join("\n")}
`
    : ""
}

To keep your current plan and maintain access, you can reactivate your subscription before ${formattedDate}.

Manage your subscription: ${billingUrl}

---
Inbox.GOP
  `,
  )

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
      console.error("Mailgun API error:", response.status, errorText)
      return false
    }

    const result = await response.json()
    console.log("Subscription cancellation warning email sent successfully:", result.id)
    return true
  } catch (error) {
    console.error("Error sending subscription cancellation warning email:", error)
    return false
  }
}

export async function sendDowngradeScheduledEmail(
  to: string,
  userName: string,
  currentPlan: string,
  targetPlan: string,
  effectiveDate: Date,
  currentFollowCount: number,
  newFollowLimit: number,
  willLoseFollows: boolean,
): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("Mailgun credentials not configured")
    return false
  }

  const formattedDate = effectiveDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const followMessage = willLoseFollows
    ? `You are currently following ${currentFollowCount} entities. With the ${targetPlan} plan, you can follow up to ${newFollowLimit} entities. We'll keep your ${newFollowLimit} oldest follows and unfollow the rest when the downgrade takes effect.`
    : `You are currently following ${currentFollowCount} entities, which is within the ${targetPlan} plan limit of ${newFollowLimit} entities.`

  const formData = new FormData()
  formData.append("from", `RIP Tool <hello@${MAILGUN_DOMAIN}>`)
  formData.append("to", to)
  formData.append("subject", `Your Plan Will Change on ${formattedDate}`)
  formData.append(
    "html",
    `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
          .warning-box { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px; }
          .info-box { background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 20px 0; border-radius: 4px; }
          h1 { margin: 0; font-size: 24px; }
          h2 { color: #555; font-size: 18px; margin-top: 0; }
          .button { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Plan Change Scheduled</h1>
          </div>
          <div class="content">
            <p>Hi ${userName},</p>
            
            <p>Your subscription plan is scheduled to change on <strong>${formattedDate}</strong>.</p>
            
            <div class="info-box">
              <strong>Current Plan:</strong> ${currentPlan}<br>
              <strong>New Plan:</strong> ${targetPlan}<br>
              <strong>Effective Date:</strong> ${formattedDate}
            </div>
            
            <h2>What This Means</h2>
            <p>You'll continue to have full access to your ${currentPlan} features until ${formattedDate}. After that date, your plan will automatically switch to ${targetPlan}.</p>
            
            ${
              willLoseFollows
                ? `
            <div class="warning-box">
              <strong>⚠️ Action Required: Entity Follows</strong><br><br>
              ${followMessage}
            </div>
            `
                : `
            <div class="info-box">
              <strong>✓ Entity Follows</strong><br><br>
              ${followMessage}
            </div>
            `
            }
            
            <p>If you'd like to keep your current plan, you can upgrade anytime before ${formattedDate}.</p>
            
            <center>
              <a href="https://app.rip-tool.com" class="button">Manage Subscription</a>
            </center>
            
            <div class="footer">
              <p>Questions? Contact us at support@rip-tool.com</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `,
  )

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
      console.error("Mailgun API error:", response.status, errorText)
      return false
    }

    const result = await response.json()
    console.log("Downgrade scheduled email sent successfully:", result.id)
    return true
  } catch (error) {
    console.error("Error sending downgrade scheduled email:", error)
    return false
  }
}

// ─── Following Digest ─────────────────────────────────────────────────────────

export interface DigestMessage {
  kind: "email" | "sms"
  subject: string       // email subject or SMS preview (first ~80 chars)
  senderIdentifier: string // senderEmail (emails) or phoneNumber (sms)
  receivedAt: Date
  shareUrl: string      // https://app.rip-tool.com/share/<token>
}

export interface DigestEntitySection {
  entityName: string
  entitySlug: string | null
  party: string | null
  state: string | null
  messages: DigestMessage[] // empty = no activity yesterday
}

export async function sendFollowingDigest(params: {
  to: string
  userId: string // Add userId for tracking
  firstName: string | null
  digestDate: string // e.g. "Thursday, May 8, 2026"
  entitySections: DigestEntitySection[]
  clientSlug: string
}): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("Mailgun credentials not configured")
    return false
  }

  const { to, userId, firstName, digestDate, entitySections, clientSlug } = params

  const APP_URL = "https://app.rip-tool.com"
  const feedUrl = generateTrackedLink(userId, "daily_digest", "feed", `/${clientSlug}/ci/campaigns`, APP_URL)
  const subscriptionsUrl = generateTrackedLink(userId, "daily_digest", "subscriptions", `/${clientSlug}/ci/subscriptions`, APP_URL)
  const settingsUrl = generateTrackedLink(userId, "daily_digest", "settings", `/${clientSlug}/account/settings`, APP_URL)
  const logoUrl = `${APP_URL}/images/IconOnly_Transparent_NoBuffer.png`

  const greeting = firstName ? `Hi ${firstName},` : "Hi there,"

  const partyColor = (party: string | null) => {
    if (!party) return "#6b7280"
    const p = party.toLowerCase()
    if (p === "republican") return "#dc2626"
    if (p === "democrat") return "#2563eb"
    return "#6b7280"
  }

  const partyLabel = (party: string | null) => {
    if (!party) return null
    return party.charAt(0).toUpperCase() + party.slice(1)
  }

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    }).format(date)
  }

  // Only include entities that actually sent messages
  const activeSections = entitySections.filter((s) => s.messages.length > 0)

  const entitySectionsHtml = activeSections
    .map((section) => {
      const partyBadge = section.party
        ? `<span style="display:inline-block;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.3px;color:#ffffff;background:${partyColor(section.party)};margin-right:6px;">${partyLabel(section.party)}</span>`
        : ""
      const stateBadge = section.state
        ? `<span style="display:inline-block;padding:1px 8px;border-radius:20px;font-size:11px;font-weight:600;color:#374151;background:#e5e7eb;margin-right:6px;">${section.state}</span>`
        : ""

      const directoryUrl = section.entitySlug
        ? generateTrackedLink(
            userId,
            "daily_digest",
            "entity_profile",
            `/${clientSlug}/directory/${section.entitySlug}`,
            APP_URL
          )
        : null

      const entityNameHtml = directoryUrl
        ? `<a href="${directoryUrl}" target="_blank" style="font-size:16px;font-weight:700;color:#f9fafb;text-decoration:none;">${section.entityName}</a>`
        : `<span style="font-size:16px;font-weight:700;color:#f9fafb;">${section.entityName}</span>`

      const viewProfileBtn = directoryUrl
        ? `<a href="${directoryUrl}" target="_blank" style="display:inline-block;margin-left:10px;padding:3px 10px;border:1px solid #374151;border-radius:4px;font-size:11px;font-weight:500;color:#9ca3af;text-decoration:none;vertical-align:middle;line-height:1.6;">View Profile ↗</a>`
        : ""

      const headerHtml = `
        <tr>
          <td style="padding:20px 24px 12px;border-top:2px solid #1f2937;">
            <div style="margin-bottom:6px;">${entityNameHtml}${viewProfileBtn}</div>
            <div>${partyBadge}${stateBadge}</div>
          </td>
        </tr>`

      const rowsHtml = section.messages
        .map((msg, i) => {
          const isEmail = msg.kind === "email"
          const icon = isEmail
            ? `<span style="display:inline-block;width:18px;height:18px;vertical-align:middle;margin-right:8px;flex-shrink:0;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              </span>`
            : `<span style="display:inline-block;width:18px;height:18px;vertical-align:middle;margin-right:8px;flex-shrink:0;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
              </span>`
          const bg = i % 2 === 0 ? "#111827" : "#0f172a"
          const borderTop = i === 0 ? "border-top:1px solid #1f2937;" : ""

          // Truncate SMS previews to 60 chars to prevent wrapping
          const displaySubject = !isEmail && msg.subject.length > 60
            ? msg.subject.slice(0, 60) + "…"
            : msg.subject

          // Track campaign clicks
          const trackedShareUrl = generateTrackedLink(
            userId,
            "daily_digest",
            "campaign",
            msg.shareUrl,
            APP_URL
          )

          return `
            <tr>
              <td style="padding:10px 24px;background:${bg};${borderTop}border-bottom:1px solid #1f2937;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;width:100%;">
                      ${icon}
                      <a href="${trackedShareUrl}" target="_blank" style="font-size:13px;color:#e5e7eb;text-decoration:none;font-weight:500;">${displaySubject}</a>
                    </td>
                    <td style="text-align:right;white-space:nowrap;padding-left:16px;vertical-align:middle;">
                      <span style="font-size:12px;color:#6b7280;">${formatTime(msg.receivedAt)}</span>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top:2px;padding-left:26px;">
                      <span style="font-size:11px;color:#4b5563;">${msg.senderIdentifier}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>`
        })
        .join("")

      return `
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          ${headerHtml}
          ${rowsHtml}
        </table>`
    })
    .join(`<tr><td style="height:8px;"></td></tr>`)

  const totalMessages = entitySections.reduce((s, e) => s + e.messages.length, 0)
  const entitiesWithActivity = activeSections.length

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Daily Digest - Inbox.GOP</title>
</head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030712;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logoUrl}" alt="Inbox.GOP" width="28" height="28" style="display:inline-block;vertical-align:middle;margin-right:8px;" />
                    <span style="font-size:13px;color:#6b7280;font-weight:500;vertical-align:middle;">Following Digest</span>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <span style="font-size:12px;color:#4b5563;">${digestDate}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Intro card -->
          <tr>
            <td style="background:#111827;border-radius:8px 8px 0 0;padding:20px 24px;border-bottom:1px solid #1f2937;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;">
                    <p style="margin:0 0 4px;font-size:15px;color:#f9fafb;font-weight:600;">${greeting}</p>
                    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                      Here&apos;s what the ${entitySections.length} ${entitySections.length === 1 ? "entity" : "entities"} you follow sent yesterday.
                      ${totalMessages > 0 ? `<strong style="color:#e5e7eb;">${totalMessages} message${totalMessages === 1 ? "" : "s"}</strong> from <strong style="color:#e5e7eb;">${entitiesWithActivity}</strong> of them.` : "None of them sent anything yesterday."}
                    </p>
                  </td>
                  <td style="text-align:right;vertical-align:top;padding-left:16px;white-space:nowrap;">
                    <a href="${subscriptionsUrl}" target="_blank" style="display:inline-block;padding:7px 14px;background:#1f2937;border:1px solid #374151;border-radius:6px;font-size:12px;font-weight:600;color:#e5e7eb;text-decoration:none;">View More</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Entity sections -->
          <tr>
            <td style="background:#0d1117;border-radius:0 0 8px 8px;overflow:hidden;">
              ${entitySectionsHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;">
              <p style="margin:0;font-size:12px;color:#374151;text-align:center;line-height:1.8;">
                You&apos;re receiving this because you follow entities on
                <a href="https://app.rip-tool.com" style="color:#6b7280;text-decoration:none;">app.rip-tool.com</a>.<br/>
                View the full feed at
                <a href="${feedUrl}" style="color:#6b7280;text-decoration:none;">${feedUrl.replace("https://", "")}</a>.<br/>
                To stop receiving this digest, visit your
                <a href="${settingsUrl}" style="color:#6b7280;text-decoration:none;">email settings</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `${greeting}

Daily Digest - Inbox.GOP — ${digestDate}

${activeSections
  .map((s) => {
    const meta = [s.party, s.state].filter(Boolean).join(" · ")
    const header = `${s.entityName}${meta ? ` (${meta})` : ""}`
    return `${header}\n${s.messages.map((m) => `  [${m.kind.toUpperCase()}] ${m.subject}\n  ${m.senderIdentifier}\n  ${m.shareUrl}`).join("\n\n")}`
  })
  .join("\n\n---\n\n")}

View more: ${subscriptionsUrl}
View full feed: ${feedUrl}

To stop receiving this digest, update your email settings: ${settingsUrl}
`

  const formData = new FormData()
  formData.append("from", `Inbox.GOP Digest <digest@${MAILGUN_DOMAIN}>`)
  formData.append("to", to)
  formData.append("subject", `Daily Digest - Inbox.GOP`)
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
      console.error("Mailgun following digest error:", response.status, errorText)
      return false
    }

    return true
  } catch (error) {
    console.error("Error sending following digest:", error)
    return false
  }
}

// ── Weekly Top-10 Digest ──────────────────────────────────────────────────────

export interface WeeklyDigestItem {
  kind: "email" | "sms"
  subject: string          // subject line or SMS preview
  entityName: string
  entitySlug: string | null
  party: string | null
  state: string | null
  senderIdentifier: string // email address or phone number
  receivedAt: Date
  viewCount: number
  shareUrl: string
}

export async function sendWeeklyDigest(params: {
  to: string
  firstName: string | null
  weekStart: string // e.g. "Sunday, May 4, 2026"
  weekEnd: string   // e.g. "Saturday, May 10, 2026"
  items: WeeklyDigestItem[]
  clientSlug: string
}): Promise<boolean> {
  const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
  const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN

  if (!MAILGUN_API_KEY || !MAILGUN_DOMAIN) {
    console.error("Mailgun credentials not configured")
    return false
  }

  const { to, firstName, weekStart, weekEnd, items, clientSlug } = params

  const APP_URL = "https://app.rip-tool.com"
  const feedUrl = `${APP_URL}/${clientSlug}/ci/campaigns`
  const subscriptionsUrl = `${APP_URL}/${clientSlug}/ci/subscriptions`
  const settingsUrl = `${APP_URL}/${clientSlug}/account/settings`
  const logoUrl = `${APP_URL}/images/IconOnly_Transparent_NoBuffer.png`

  const greeting = firstName ? `Hi ${firstName},` : "Hi there,"

  const partyColor = (party: string | null) => {
    if (!party) return "#6b7280"
    const p = party.toLowerCase()
    if (p === "republican") return "#dc2626"
    if (p === "democrat") return "#2563eb"
    return "#6b7280"
  }

  const partyLabel = (party: string | null) => {
    if (!party) return null
    return party.charAt(0).toUpperCase() + party.slice(1)
  }

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/New_York",
    }).format(date)
  }

  const emailIcon = `<span style="display:inline-block;width:18px;height:18px;vertical-align:middle;margin-right:8px;flex-shrink:0;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
  </span>`

  const smsIcon = `<span style="display:inline-block;width:18px;height:18px;vertical-align:middle;margin-right:8px;flex-shrink:0;">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
  </span>`

  const rowsHtml = items
    .map((item, i) => {
      const bg = i % 2 === 0 ? "#111827" : "#0f172a"
      const borderTop = i === 0 ? "border-top:1px solid #1f2937;" : ""
      const icon = item.kind === "email" ? emailIcon : smsIcon
      const displaySubject = item.subject.length > 50 ? item.subject.slice(0, 50) + "…" : item.subject

      const directoryUrl = item.entitySlug ? `${APP_URL}/directory/${item.entitySlug}` : null

      const partyBadge = item.party
        ? `<span style="display:inline-block;padding:1px 6px;border-radius:20px;font-size:10px;font-weight:700;color:#ffffff;background:${partyColor(item.party)};margin-right:4px;">${partyLabel(item.party)}</span>`
        : ""
      const stateBadge = item.state
        ? `<span style="display:inline-block;padding:1px 6px;border-radius:20px;font-size:10px;font-weight:600;color:#374151;background:#e5e7eb;margin-right:4px;">${item.state}</span>`
        : ""

      const entityLink = directoryUrl
        ? `<a href="${directoryUrl}" target="_blank" style="font-size:11px;font-weight:600;color:#9ca3af;text-decoration:none;">${item.entityName}</a>`
        : `<span style="font-size:11px;font-weight:600;color:#9ca3af;">${item.entityName}</span>`

      const rankLabel = `<span style="font-size:11px;font-weight:700;color:#4b5563;margin-right:10px;min-width:18px;display:inline-block;">#${i + 1}</span>`

      return `
        <tr>
          <td style="padding:10px 24px;background:${bg};${borderTop}border-bottom:1px solid #1f2937;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="vertical-align:middle;width:100%;">
                  ${rankLabel}${icon}
                  <a href="${item.shareUrl}" target="_blank" style="font-size:12px;color:#e5e7eb;text-decoration:none;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:calc(100% - 140px);">${displaySubject}</a>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:4px;padding-left:36px;">
                  ${entityLink}&nbsp;${partyBadge}${stateBadge}
                  <span style="font-size:11px;color:#4b5563;margin-left:6px;">${item.senderIdentifier}</span>
                </td>
              </tr>
              <tr>
                <td colspan="2" style="padding-top:2px;padding-left:36px;">
                  <span style="font-size:10px;color:#374151;">${formatDate(item.receivedAt)} ET</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    })
    .join("")

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Weekly Top 10 Digest - Inbox.GOP</title>
</head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#030712;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:0 0 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logoUrl}" alt="Inbox.GOP" width="28" height="28" style="display:inline-block;vertical-align:middle;margin-right:8px;" />
                    <span style="font-size:13px;color:#6b7280;font-weight:500;vertical-align:middle;">Weekly Top 10</span>
                  </td>
                  <td style="text-align:right;vertical-align:middle;">
                    <span style="font-size:12px;color:#4b5563;">${weekStart} – ${weekEnd}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Intro card -->
          <tr>
            <td style="background:#111827;border-radius:8px 8px 0 0;padding:20px 24px;border-bottom:1px solid #1f2937;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:top;">
                    <p style="margin:0 0 4px;font-size:15px;color:#f9fafb;font-weight:600;">${greeting}</p>
                    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                      Here are the <strong style="color:#e5e7eb;">top ${items.length} most-viewed</strong> emails and SMS from across Inbox.GOP over the past week.
                    </p>
                  </td>
                  <td style="text-align:right;vertical-align:top;padding-left:16px;white-space:nowrap;">
                    <a href="${subscriptionsUrl}" target="_blank" style="display:inline-block;padding:7px 14px;background:#1f2937;border:1px solid #374151;border-radius:6px;font-size:12px;font-weight:600;color:#e5e7eb;text-decoration:none;">View More</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Top 10 list -->
          <tr>
            <td style="background:#0d1117;border-radius:0 0 8px 8px;overflow:hidden;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                ${rowsHtml}
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0 0;">
              <p style="margin:0;font-size:12px;color:#374151;text-align:center;line-height:1.8;">
                You&apos;re receiving this because you follow entities on
                <a href="https://app.rip-tool.com" style="color:#6b7280;text-decoration:none;">app.rip-tool.com</a>.<br/>
                View the full feed at
                <a href="${feedUrl}" style="color:#6b7280;text-decoration:none;">${feedUrl.replace("https://", "")}</a>.<br/>
                To stop receiving this digest, visit your
                <a href="${settingsUrl}" style="color:#6b7280;text-decoration:none;">email settings</a>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  const text = `${greeting}

Weekly Top 10 Digest - Inbox.GOP
${weekStart} – ${weekEnd}

${items
  .map((item, i) => {
    const meta = [item.party, item.state].filter(Boolean).join(" · ")
    return `#${i + 1} [${item.kind.toUpperCase()}] ${item.subject}
  Entity: ${item.entityName}${meta ? ` (${meta})` : ""}
  ${item.senderIdentifier}
  ${item.viewCount} views · ${formatDate(item.receivedAt)} ET
  ${item.shareUrl}`
  })
  .join("\n\n")}

View more: ${subscriptionsUrl}
View full feed: ${feedUrl}

To stop receiving this digest, update your email settings: ${settingsUrl}
`

  const formData = new FormData()
  formData.append("from", `Inbox.GOP Digest <digest@${MAILGUN_DOMAIN}>`)
  formData.append("to", to)
  formData.append("subject", `Weekly Top 10 - Inbox.GOP`)
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
      console.error("Mailgun weekly digest error:", response.status, errorText)
      return false
    }

    return true
  } catch (error) {
    console.error("Error sending weekly digest:", error)
    return false
  }
}
