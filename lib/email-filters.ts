// System email patterns to exclude from campaign detection
const SYSTEM_EMAIL_PATTERNS = [
  // Microsoft system emails
  /new app.*connected to your microsoft account/i,
  /microsoft account security/i,
  /sign-in attempt/i,
  /unusual sign-in activity/i,
  /microsoft account team/i,
  /account-security-noreply@accountprotection\.microsoft\.com/i,

  // Common system senders
  /noreply@/i,
  /no-reply@/i,
  /donotreply@/i,
  /security@/i,
  /notifications@/i,
  /alerts@/i,

  // Common system subjects
  /security alert/i,
  /account notification/i,
  /password.*changed/i,
  /login.*detected/i,
  /verification/i,
  /confirm.*email/i,
  /welcome.*account/i,
  /account.*created/i,
  /subscription.*confirmation/i,
  /unsubscribe/i,

  // Auto-generated patterns
  /\[automated\]/i,
  /\[system\]/i,
  /\[notification\]/i,
  /do not reply/i,
  /this is an automated/i,
]

export function isSystemEmail(subject: string, fromEmail: string, fromName?: string): boolean {
  const textToCheck = `${subject} ${fromEmail} ${fromName || ""}`.toLowerCase()

  return SYSTEM_EMAIL_PATTERNS.some((pattern) => pattern.test(textToCheck))
}

export function isLikelyRealCampaign(subject: string, fromEmail: string, fromName?: string): boolean {
  // Must not be a system email
  if (isSystemEmail(subject, fromEmail, fromName)) {
    return false
  }

  // Additional checks for real campaigns
  const hasRealSubject = subject.trim().length > 5
  const hasRealSender = !fromEmail.includes("noreply") && !fromEmail.includes("no-reply")

  return hasRealSubject && hasRealSender
}
