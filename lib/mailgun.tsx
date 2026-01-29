// Mailgun email sending utility
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
          <p>Republican Inboxing Protocol</p>
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
Republican Inboxing Protocol
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
          <p>Republican Inboxing Protocol</p>
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
Republican Inboxing Protocol
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
