// Mailgun email sending utility

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
